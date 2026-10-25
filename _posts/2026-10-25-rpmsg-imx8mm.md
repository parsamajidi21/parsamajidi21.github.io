---
layout: post
title: "Linux and FreeRTOS on One Chip: RPmsg on the i.MX8M Mini"
date: 2026-10-25 09:00:00
description: Running FreeRTOS on the Cortex-M4 next to Linux on the Cortex-A53 cores of a Toradex Verdin i.MX8M Mini, and making them talk over RPmsg. Yocto build, U-Boot bootaux, a custom device tree, and what each piece actually does.
tags: linux yocto
categories: linux
giscus_comments: true
related_posts: true
pretty_table: true
toc:
  sidebar: left
---

<!-- prettier-ignore-start -->
> **TL;DR**: The i.MX8M Mini has Cortex-A53 cores for Linux and a Cortex-M4 for real-time work. I built a Toradex Yocto image, started a FreeRTOS firmware on the M4 from U-Boot, added a device tree that reserves shared memory and describes the M4 to Linux, and exchanged messages between the two cores through `/dev/ttyRPMSG30`.
>
> Device tree and original notes: [github.com/parsamajidi21/RPmsg-Device-Tree](https://github.com/parsamajidi21/RPmsg-Device-Tree)
{: .block-tip }

<!-- prettier-ignore-end -->

## Introduction

Many modern SoCs pair "big" application cores with a small microcontroller core. The NXP i.MX8M Mini is a good example: up to four **Cortex-A53** cores that run Linux, and one **Cortex-M4F** that can run bare metal or an RTOS. Running different operating systems on different cores of the same chip is called **asymmetric multiprocessing (AMP)**.

The appeal is simple. Linux is great at networking, storage and user interfaces, but it is not a hard real-time OS. The M4 can handle the time-critical part (motor control, sensor sampling, a safety watchdog) with predictable latency, while Linux does everything else. For that to work, the two sides need a way to talk. On NXP parts that way is **RPmsg**, a message bus built on virtio and shared memory.

In this post I walk through the setup I built on a **Toradex Verdin i.MX8M Mini**: building the Linux image, starting firmware on the M4, writing the device tree that glues the two together, and finally sending messages from Linux to FreeRTOS. Along the way I explain what each address and device tree node is for, because that is the part most guides skip.

## Setup

| Item         | Version / model                                                   |
| ------------ | ----------------------------------------------------------------- |
| SoM          | Toradex Verdin i.MX8M Mini Quad 2GB WB IT V1.1A (product ID 0055) |
| Carrier      | Toradex Dahlia V1.0C                                              |
| BSP          | Toradex BSP 6.3.0                                                 |
| Yocto        | 4.0 (Kirkstone)                                                   |
| Kernel       | Toradex downstream 5.15.77, based on NXP BSP L5.15_2.1.0          |
| M4 firmware  | FreeRTOS demos from the NXP MCUXpresso SDK for `evkmimx8mm`       |
| M4 toolchain | GNU Arm Embedded (`arm-none-eabi-gcc`)                            |

<div class="row mt-3">
  <div class="col-sm mt-3 mt-md-0">
    {% include figure.liquid loading="eager" path="assets/img/rpmsg/tdx-info.png" class="img-fluid rounded z-depth-1" zoomable=true caption="tdx-info on the board: BSP 6.3.0, kernel 5.15.77, Verdin iMX8M Mini (0055 V1.1A)." %}
  </div>
</div>

## How the pieces fit together

Before the commands, here is the whole flow. Everything later in the post is one of these steps.

1. **U-Boot** copies the M4 firmware into the M4's tightly coupled memory (TCM) and releases the M4 from reset (`bootaux`).
2. The **FreeRTOS** firmware starts, publishes a **resource table** in shared DDR describing the communication buffers it expects, and waits.
3. **Linux** boots on the A53 cores. The device tree tells it which DDR regions are shared with the M4, so Linux keeps its hands off them.
4. The **`imx_rproc`** remoteproc driver sees that the M4 is already running, attaches to it, reads the resource table and creates a **virtio** device for the RPmsg bus.
5. The two cores exchange messages through two ring buffers (**vrings**) in shared memory, and poke each other with interrupts through the **Messaging Unit (MU)**.
6. The M4 announces a named channel, `rpmsg-virtual-tty-channel-1`. The **`imx_rpmsg_tty`** driver binds to it and creates **`/dev/ttyRPMSG30`**. Writing to that file sends a message to the M4.

## Step 1: Build the Linux image with Yocto

Toradex ships its BSP as a `repo` manifest. First install the `repo` tool:

```bash
mkdir -p ~/bin
export PATH=~/bin:$PATH
curl https://commondatastorage.googleapis.com/git-repo-downloads/repo > ~/bin/repo
chmod a+x ~/bin/repo
```

Then fetch the Kirkstone-based BSP and set up the build environment:

```bash
mkdir -p ~/oe-core && cd ~/oe-core
repo init -u git://git.toradex.com/toradex-manifest.git -b kirkstone-6.x.y -m tdxref/default.xml
repo sync
. export   # sets up the shell and creates build/conf/*.conf on first run
```

Sourcing `export` only affects the current shell, so repeat it in every new terminal.

In `build/conf/local.conf`, select the machine and accept the NXP EULA (needed for some NXP firmware and libraries pulled in by `meta-freescale`):

```bash
MACHINE ?= "verdin-imx8mm"
ACCEPT_FSL_EULA = "1"
```

I built the minimal command-line reference image:

```bash
bitbake tdx-reference-minimal-image
```

The first build takes a few hours. The output, including the Toradex Easy Installer tarball, lands in `build/deploy/images/verdin-imx8mm/`.

## Step 2: Flash the image

Toradex modules are flashed with the **Toradex Easy Installer** (Tezi). If the module isn't already running it:

1. Download the Tezi archive for the Verdin iMX8M Mini and unpack it on the host.
2. Put the module in recovery mode: open jumper **JP3**, then hold the **Recovery** button (SW5) while pressing **ON/OFF** (SW3), and keep holding Recovery for about 10 more seconds.
3. On the host, run the loader from the unpacked archive:

   ```bash
   sudo ./recovery-linux.sh
   ```

Then extract the image tarball from `deploy/images/` onto a FAT32 USB drive, plug it into the carrier board, and install it from the Tezi interface (I connected to it over VNC).

## Step 3: First firmware on the Cortex-M4

Before adding RPmsg, it is worth checking that we can run anything at all on the M4.

### Build hello_world

Download the MCUXpresso SDK for the **EVK-MIMX8MM** board (Toradex's [FreeRTOS guide](https://developer.toradex.com/software/real-time/freertos/freertos-on-the-cortex-m4-of-a-verdin-imx8m-mini/) explains which options to pick), and install a bare-metal Arm toolchain:

```bash
sudo apt-get install gcc-arm-none-eabi binutils-arm-none-eabi
export ARMGCC_DIR=/usr   # or the path of an extracted toolchain tarball
```

Build the demo:

```bash
cd <sdk>/boards/evkmimx8mm/demo_apps/hello_world/armgcc
./build_all.sh
```

`build_all.sh` builds debug and release variants for each memory target. The **release, TCM** build gives `release/hello_world.bin`. Copy it to a FAT32 SD card and insert the card in the carrier board's SD slot.

### Two serial consoles

The Dahlia carrier has a USB-to-serial chip on its debug USB-C port (X18) that exposes four ports on the host. On my setup, `/dev/ttyUSB3` was the Linux/U-Boot console (UART3), and `/dev/ttyUSB2` was the M4 debug UART (**UART4**). I used `tmux` to keep one `picocom` session for each in the same window:

```bash
sudo picocom -b 115200 /dev/ttyUSB3   # top pane: U-Boot / Linux
sudo picocom -b 115200 /dev/ttyUSB2   # bottom pane: Cortex-M4
```

<div class="row mt-3">
  <div class="col-sm mt-3 mt-md-0">
    {% include figure.liquid loading="eager" path="assets/img/rpmsg/tmux-consoles.png" class="img-fluid rounded z-depth-1" zoomable=true caption="tmux with the A53 console (top) and the M4 console (bottom)." %}
  </div>
</div>

Power on the board and press a key to stop autoboot. You land in the U-Boot shell:

<div class="row mt-3">
  <div class="col-sm mt-3 mt-md-0">
    {% include figure.liquid loading="eager" path="assets/img/rpmsg/uboot-prompt.png" class="img-fluid rounded z-depth-1" zoomable=true caption="U-Boot on the Verdin iMX8M Mini." %}
  </div>
</div>

### Start the M4 from U-Boot

```text
Verdin iMX8MM # setenv m4addr 0x7e0000
Verdin iMX8MM # saveenv
Verdin iMX8MM # fatload mmc 1 0x48000000 hello_world.bin && dcache flush && cp.b 0x48000000 ${m4addr} 0x20000
Verdin iMX8MM # bootaux ${m4addr}
```

<div class="row mt-3">
  <div class="col-sm mt-3 mt-md-0">
    {% include figure.liquid loading="eager" path="assets/img/rpmsg/hello-world.png" class="img-fluid rounded z-depth-1" zoomable=true caption="bootaux starts the M4, and 'hello world.' appears on the M4 console." %}
  </div>
</div>

Each command has a reason:

- **`m4addr = 0x7e0000`** is where the A53 cores see the M4's **TCML**, the 128 KB tightly coupled code memory. The M4 sees the same memory at `0x1FFE0000`. `saveenv` keeps the variable across reboots.
- **`fatload mmc 1 0x48000000 hello_world.bin`** reads the file from the SD card (`mmc 1` is the SD controller, `FSL_SDHC: 1` in the boot log) into a scratch area of DDR at `0x48000000`.
- **`dcache flush`** writes the A53 data cache back to memory, so the bytes really are in RAM and not only in the A53's cache.
- **`cp.b 0x48000000 ${m4addr} 0x20000`** copies 128 KB (the full TCML size) from DDR into the TCM.
- **`bootaux ${m4addr}`** releases the M4 from reset.

The `bootaux` output is a nice sanity check. An Arm Cortex-M image starts with its vector table: the first word is the initial stack pointer, the second is the reset handler. U-Boot reads both from the image and prints them:

```text
## Starting auxiliary core stack = 0x20020000, pc = 0x1FFE030D...
```

`0x1FFE030D` is inside the TCML as the M4 sees it (the odd last bit just marks Thumb code), and `0x20020000` is the top of the 128 KB data TCM (TCMU, which starts at `0x20000000`). If those numbers look wrong, you copied the wrong file or the wrong build target.

## Step 4: A device tree for RPmsg

Running the M4 next to Linux is not enough. Linux also has to know:

- which memory belongs to the M4 or is shared with it, so it never allocates those pages for itself;
- that there is a remote core and how to talk to it (mailbox, resource table, vrings);
- which peripherals the M4 owns, so Linux doesn't reconfigure or power them down.

The stock Verdin device trees don't describe any of this. NXP's EVK has an RPmsg variant, `imx8mm-evk-rpmsg.dts`, so I took its RPmsg parts and combined them with the Verdin includes. The full file is [`imx8mm-verdin-wifi-dev-rpmsg.dts`](https://github.com/parsamajidi21/RPmsg-Device-Tree/blob/main/imx8mm-verdin-wifi-dev-rpmsg.dts). The interesting parts follow.

### Base board

```dts
#include "imx8mm-verdin.dtsi"
#include "imx8mm-verdin-wifi.dtsi"
#include "imx8mm-verdin-dev.dtsi"
```

These pull in the SoM, the Wi-Fi/Bluetooth variant, and the carrier description, the same as Toradex's own `imx8mm-verdin-wifi-dev.dts`.

### Reserved memory

```dts
reserved-memory {
    #address-cells = <2>;
    #size-cells = <2>;
    ranges;

    m4_reserved: m4@0x80000000 {
        no-map;
        reg = <0 0x80000000 0 0x1000000>;
    };

    vdev0vring0: vdev0vring0@b8000000 {
        reg = <0 0xb8000000 0 0x8000>;
        no-map;
    };

    vdev0vring1: vdev0vring1@b8008000 {
        reg = <0 0xb8008000 0 0x8000>;
        no-map;
    };

    rsc_table: rsc_table@b80ff000 {
        reg = <0 0xb80ff000 0 0x1000>;
        no-map;
    };

    vdevbuffer: vdevbuffer@b8400000 {
        compatible = "shared-dma-pool";
        reg = <0 0xb8400000 0 0x100000>;
        no-map;
    };
};
```

| Region        | Address      | Size  | Purpose                                                            |
| ------------- | ------------ | ----- | ------------------------------------------------------------------ |
| `m4_reserved` | `0x80000000` | 16 MB | DDR for M4 code and data, if the firmware is built to run from DDR |
| `vdev0vring0` | `0xb8000000` | 32 KB | First virtio ring (one direction)                                  |
| `vdev0vring1` | `0xb8008000` | 32 KB | Second virtio ring (the other direction)                           |
| `rsc_table`   | `0xb80ff000` | 4 KB  | Resource table written by the M4 firmware                          |
| `vdevbuffer`  | `0xb8400000` | 1 MB  | Pool for the message buffers themselves                            |

`no-map` removes the region from Linux's memory map entirely, so nothing in Linux can use it by accident. These addresses are not arbitrary: they must match what the FreeRTOS firmware was built with. The SDK demos for `evkmimx8mm` use exactly these values, which is why reusing the EVK layout works.

### The remote core

```dts
imx8mm-cm4 {
    compatible = "fsl,imx8mm-cm4";
    rsc-da = <0xb8000000>;
    clocks = <&clk IMX8MM_CLK_M4_DIV>;
    mbox-names = "tx", "rx", "rxdb";
    mboxes = <&mu 0 1
          &mu 1 1
          &mu 3 1>;
    memory-region = <&vdevbuffer>, <&vdev0vring0>, <&vdev0vring1>, <&rsc_table>;
    syscon = <&src>;
    fsl,startup-delay-ms = <500>;
};
```

This node binds the **`imx_rproc`** remoteproc driver (`drivers/remoteproc/imx_rproc.c`). The properties that matter:

- **`memory-region`** hands the vrings, the buffer pool and the resource table to the driver.
- **`mboxes`** uses three channels of the **Messaging Unit**, a hardware block that lets one core raise an interrupt on the other: transmit, receive, and a receive doorbell. The data travels through shared memory; the MU only says "there is something new".
- **`syscon = <&src>`** gives the driver access to the System Reset Controller. In the NXP 5.15 kernel, `imx_rproc` reads the M4 reset bits there at probe time. If the M4 is not held in reset, the driver concludes that someone (U-Boot, in our case) already started it, and **attaches** instead of loading firmware itself.

Two properties are inherited from the EVK file but don't do anything in this setup, as far as I can tell from the NXP lf-5.15 source: `rsc-da` isn't read by `imx_rproc` at all, and `fsl,startup-delay-ms` is only applied when Linux starts the core itself, not when it attaches.

### Peripherals owned by the M4

```dts
&uart4 {
    status = "disabled";
};
```

UART4 is the M4's debug console. If Linux enabled it too, both cores would fight over the same UART. The file also has an `init-on-array` on the clock controller (an NXP downstream property). It lists clocks such as `IMX8MM_CLK_UART4_ROOT` that Linux must keep running even though no Linux driver uses them, so the M4's peripherals don't stop when Linux turns off unused clocks.

The rest of the file (`rpmsg_audio`, and disabling `sai1`, `sai3`, `sdma3` and the WM8524 codec) comes from the EVK's RPmsg audio setup, where the M4 plays audio while Linux sleeps. It isn't needed for the TTY demo. You can even see it in the kernel log later: `imx-audio-rpmsg: no reserved DMA memory`. A cleaner version of this file would drop those nodes.

### Adding it to the build

I placed the file next to the other i.MX device trees in the kernel source and added it to the device tree Makefile:

```makefile
dtb-$(CONFIG_ARCH_MXC) += imx8mm-verdin-wifi-dev-rpmsg.dtb
```

Then I added it to `KERNEL_DEVICETREE` in the machine configuration (`layers/meta-toradex-nxp/conf/machine/verdin-imx8mm.conf`), so the build actually produces it and installs it into the image:

```bash
KERNEL_DEVICETREE = " \
    freescale/imx8mm-verdin-nonwifi-dahlia.dtb \
    freescale/imx8mm-verdin-nonwifi-dev.dtb \
    freescale/imx8mm-verdin-nonwifi-yavia.dtb \
    freescale/imx8mm-verdin-wifi-dahlia.dtb \
    freescale/imx8mm-verdin-wifi-dev.dtb \
    freescale/imx8mm-verdin-wifi-yavia.dtb \
    freescale/imx8mm-verdin-wifi-dev-rpmsg.dtb \
"
```

Finally I pointed `TORADEX_PRODUCT_IDS` for my module (product ID **0055**, printed in the U-Boot banner) at the new device tree. The Toradex image classes use this mapping to generate the Easy Installer metadata, which says which device tree goes with which module:

```bash
TORADEX_PRODUCT_IDS[0055] = "imx8mm-verdin-wifi-v1.1-dev-rpmsg.dtb"
```

Rebuild the image with `bitbake` and flash it again as in step 2.

<!-- prettier-ignore-start -->
> **A cleaner way.** Editing files in `tmp/work-shared/.../kernel-source` and in Toradex's own layer works for a quick experiment, but `bitbake -c cleanall` throws away changes in `work-shared`, and the next `repo sync` can conflict with or overwrite edits in a vendor layer. For anything you want to keep, put them in your own layer: the `.dts` as a kernel patch in a `linux-toradex_%.bbappend` (`SRC_URI:append = " file://0001-arm64-dts-add-verdin-rpmsg.patch"`), and `KERNEL_DEVICETREE:append = " freescale/imx8mm-verdin-wifi-dev-rpmsg.dtb"` in your layer's config or `local.conf`.
{: .block-tip }

<!-- prettier-ignore-end -->

## Step 5: Talk to the M4 over RPmsg

### Build the RPmsg firmware

The SDK has two FreeRTOS RPmsg demos in `boards/evkmimx8mm/multicore_examples/`: `rpmsg_lite_pingpong_rtos` and `rpmsg_lite_str_echo_rtos`. I used the string echo demo, which prints every message it receives:

```bash
cd <sdk>/boards/evkmimx8mm/multicore_examples/rpmsg_lite_str_echo_rtos/armgcc
./build_all.sh
```

Copy `rpmsg_lite_str_echo_rtos.bin` to the SD card.

<div class="row mt-3">
  <div class="col-sm mt-3 mt-md-0">
    {% include figure.liquid loading="eager" path="assets/img/rpmsg/sd-card-files.png" class="img-fluid rounded z-depth-1" zoomable=true caption="The firmware files on the SD card, as seen from U-Boot." %}
  </div>
</div>

### Start it from U-Boot

Same commands as before, just a different file (`m4addr` is already saved):

```text
Verdin iMX8MM # fatload mmc 1 0x48000000 rpmsg_lite_str_echo_rtos.bin && dcache flush && cp.b 0x48000000 ${m4addr} 0x20000
Verdin iMX8MM # bootaux ${m4addr}
```

<div class="row mt-3">
  <div class="col-sm mt-3 mt-md-0">
    {% include figure.liquid loading="eager" path="assets/img/rpmsg/rpmsg-echo-boot.png" class="img-fluid rounded z-depth-1" zoomable=true caption="The echo demo starts on the M4 and waits for Linux." %}
  </div>
</div>

Then type `boot` in the U-Boot console to start Linux. The order matters: the M4 must be running before Linux boots, otherwise `imx_rproc` finds it in reset and there is nothing to attach to.

### Send messages from Linux

Once Linux is up, load the RPmsg TTY driver and write to the new device:

```bash
modprobe imx_rpmsg_tty
echo "hello world!" > /dev/ttyRPMSG30
```

<div class="row mt-3">
  <div class="col-sm mt-3 mt-md-0">
    {% include figure.liquid loading="eager" path="assets/img/rpmsg/rpmsg-echo-linux.png" class="img-fluid rounded z-depth-1" zoomable=true caption="Linux (top) writes to /dev/ttyRPMSG30, and the M4 (bottom) prints each message it receives." %}
  </div>
</div>

The kernel log shows what happened on the Linux side:

```text
imx_rpmsg_tty virtio0.rpmsg-virtual-tty-channel-1.-1.30: new channel: 0x400 -> 0x1e!
Install rpmsg tty driver!
```

- **`virtio0`** is the virtio device that `imx_rproc` created after attaching to the M4.
- **`rpmsg-virtual-tty-channel-1`** is the channel name the M4 announced ("Nameservice sent" on the M4 console). `imx_rpmsg_tty` matches on that name.
- **`0x400 -> 0x1e`** are the endpoint addresses: Linux's local endpoint `0x400` talks to the M4's endpoint `0x1e`, which is **30** in decimal. The driver names the device after the remote endpoint, which is where **`ttyRPMSG30`** comes from.

On the M4 console every message arrives with its length:

```text
Get Message From Master Side : "hello world!" [len : 12]
```

## Troubleshooting notes

- **Wrong `stack`/`pc` from `bootaux`:** the image isn't a TCM build, or the copy failed. Check the file size with `ls mmc 1` and the build target in `build_all.sh`'s output.
- **No `/dev/ttyRPMSG30`:** check that Linux booted with the RPmsg device tree (`cat /proc/device-tree/model`), that the M4 was started _before_ `boot`, and that the M4 console printed "Nameservice sent".
- **Kernel crashes or random memory corruption:** a reserved region is missing or doesn't match the firmware's memory layout. The addresses in the device tree and in the firmware must agree.
- **The M4 stops printing after Linux boots:** Linux probably disabled a clock or claimed a peripheral the M4 uses. Check `init-on-array` and the `status = "disabled"` nodes.

## Conclusion

The demo itself is just text going from one core to another, but getting there touches most layers of an embedded Linux system: a Yocto BSP, the bootloader, a hand-written device tree, a remoteproc driver and a bare-metal toolchain. The main lesson for me was that **the device tree is the contract** between the two worlds. The memory map, the mailbox and the peripheral ownership all have to agree with the firmware on the other core, and the kernel trusts whatever you write there.

A natural next step is to let Linux start the M4 itself: `imx_rproc` can also load the firmware ELF from `/lib/firmware` through the remoteproc sysfs interface, which removes the manual U-Boot step.

## References

- [Original notes and device tree (GitHub)](https://github.com/parsamajidi21/RPmsg-Device-Tree)
- [Toradex: Build a Reference Image with Yocto Project/OpenEmbedded](https://developer.toradex.com/linux-bsp/os-development/build-yocto/build-a-reference-image-with-yocto-projectopenembedded/)
- [Toradex: FreeRTOS on the Cortex-M4 of a Verdin iMX8M Mini](https://developer.toradex.com/software/real-time/freertos/freertos-on-the-cortex-m4-of-a-verdin-imx8m-mini/)
- [Toradex: Device Tree Overview](https://developer.toradex.com/software/linux-resources/device-tree/)
- [NXP linux-imx `imx_rproc.c` (lf-5.15.y)](https://github.com/nxp-imx/linux-imx/blob/lf-5.15.y/drivers/remoteproc/imx_rproc.c)
- [Kynetics: Asymmetric Multiprocessing, RPMsg device and driver on Linux and Android](https://technotes.kynetics.com/2018/Linux_rpmsg_char_driver/)
- [Kynetics: An Introduction to Asymmetric Multiprocessing (ELC 2018)](https://www.slideshare.net/kynetics/amp-kynetics-elc-2018-portland)
- [Asymmetric Multiprocessing and Embedded Linux (eLinux)](https://elinux.org/images/3/3b/NOVAK_CERVENKA.pdf)
