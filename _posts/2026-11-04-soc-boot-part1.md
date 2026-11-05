---
layout: post
title: "How an Embedded SoC Boots, Part 1: From Power to the First Instruction"
date: 2026-11-04 00:00:00
description: The first post in a series on how a modern embedded SoC boots, from power-on to Linux PID 1. What happens before any console output, from power sequencing and reset to the BootROM choosing a boot device.
tags: linux boot
categories: boot
giscus_comments: true
related_posts: false
published: false
pretty_table: true
toc:
  sidebar: left
---

<!-- prettier-ignore-start -->
> **TL;DR**: On a modern embedded SoC, the first instruction does not run on the application cores. The **PMIC** brings up the power rails in a fixed order and releases reset, then a **BootROM** starts on a small **boot core**. It works only from on-chip memory, reads the boot pins and fuses, brings up the boot device and reads the first image, which holds the firmware for the **secure enclave**. None of this prints to a console, so debugging this stage means knowing what to measure.
{: .block-tip }

<!-- prettier-ignore-end -->

## About this series

Most embedded Linux engineers know the boot flow as "U-Boot, then the kernel". On a modern SoC, several pieces of firmware run before U-Boot proper, often on more than one processor, and a dead board can fail in any of them. This series follows the boot from power-on to Linux PID 1, one stage per post, with an animated diagram for each stage.

| Part  | Topic                                                                     |
| ----- | ------------------------------------------------------------------------- |
| **1** | **From power to the first instruction: PMIC, reset, BootROM (this post)** |
| 2     | Signed boot images and the secure enclave                                 |
| 3     | Waking up the DRAM: initialization and training                           |
| 4     | The system controller firmware and SCMI                                   |
| 5     | SPL → TF-A → OP-TEE → U-Boot: exception levels and hand-offs              |
| 6     | Linux takes over, plus a "last console line → failed stage" cheat sheet   |

The ideas apply to most modern application processors. For concrete examples I use NXP's i.MX95 on a generic board with LPDDR5, an SD card slot and eMMC, because it has every stage: a separate boot core, a secure enclave and a system controller. Other SoCs name and split these stages differently, and the exact pins, fuses and offsets always differ, so check your part's datasheet and reference manual for those.

## Which core boots first

A modern application processor has more than one kind of core. On the i.MX95:

| Processor                         | Role                                                       |
| --------------------------------- | ---------------------------------------------------------- |
| **Cortex-M33**                    | Boot core and system controller                            |
| **Cortex-A55** cluster            | Application cores: SPL, TF-A, U-Boot, Linux                |
| **Cortex-M7**                     | Optional real-time core, for your own firmware             |
| **EdgeLock Secure Enclave (ELE)** | Separate security subsystem: keys, fuses, signature checks |

The boot core is the **M33**, not the A55. It runs three pieces of firmware in turn:

1. The **BootROM**, in mask ROM. It picks the boot device and loads the first images.
2. The **OEI** (Optional Executable Image), which initializes the DRAM and returns to the ROM (part 3).
3. The **System Manager**, which owns power, clocks and resets and serves the application cores over SCMI (part 4).

The pattern is common on recent SoCs: the most privileged software runs on a small core that boots first, and the big application cores start later, as its clients. Older parts work differently. On the i.MX8M, for example, the ROM runs on the first Cortex-A53 core and the Cortex-M core is an optional extra. Which core runs the ROM is the first thing to find out for any new SoC, because it tells you where to look when nothing happens.

## Before the first instruction: power

Nothing runs until the power rails are up. A **PMIC** (power management IC) generates the board's rails from the input supply. Its **OTP** (one-time-programmable memory) holds the power-up sequence: which rails turn on, in which order, at what voltage and with what delay. NXP pairs the i.MX95 with its PF09 PMIC family, but the principle is the same for any PMIC.

The order matters. Powering one domain before another can drive current through protection diodes into an unpowered domain, or leave a block in an undefined state. The datasheet of every SoC gives a power-up sequence, and it usually looks like this:

1. The **always-on** domain (battery-backed or "SNVS/BBSM" logic) comes up first and goes down last.
2. The **core logic** rails (on the i.MX95, VDD_SOC and VDD_ARM), at well under 1 V.
3. The analog, PLL and PHY supplies, and the 1.8 V I/O.
4. The **DRAM** rails, in the order the memory standard requires.
5. The 3.3 V I/O.
6. **Reset release**: the PMIC or a supervisor releases the power-on reset (POR_B on i.MX) once every rail is in regulation.

The core voltage isn't one fixed number. Many SoCs run the core at different voltages for different performance modes, so the value you measure depends on the part, the PMIC configuration and the firmware. Compare it with your schematic, not with another board.

When reset is released, the SoC latches its **boot-mode pins**. Changing the boot switches after this has no effect until the next reset.

From here on, the DRAM is **powered but unusable**. It holds nothing, and the DDR controller can't talk to it reliably until it has been initialized and the link trained, which happens later (part 3). Until then, all code and data live in on-chip memory.

## The BootROM

The **BootROM** is mask ROM inside the SoC. It is fixed in silicon and can't be updated; fuses can only adjust what it does. Out of reset, the boot core fetches its first instruction from it, and every other core stays in reset.

The ROM's world is small:

- **Code** runs from ROM.
- **Working memory** is on-chip RAM. On the i.MX95 that is the M33's own tightly coupled memory (TCM). DRAM is off limits.
- **It prints nothing.** BootROMs are generally silent. The first console output comes from later firmware, and only if it was built with a console enabled.

Which console prints first depends on the BSP:

| Stage                            | Console on the i.MX95 | Prints when                                 |
| -------------------------------- | --------------------- | ------------------------------------------- |
| BootROM                          | none                  | never                                       |
| OEI, System Manager              | M33 debug UART        | when built with debug output, or by default |
| SPL, TF-A, OP-TEE, U-Boot, Linux | A55 console UART      | depends on each one's console configuration |

On a board with a debug USB port, several UARTs often come out of one USB-serial chip. Find out which one belongs to which core before you decide a board is dead: on the i.MX95 the earliest output appears on the M33 UART, not on the Linux console.

At the same time, the **secure enclave** (the ELE on the i.MX95) comes out of reset and runs its own internal ROM. The boot ROM loads images and asks the enclave to authenticate them. The enclave can't do much until its full firmware is loaded from the first image, which is the last step of this post and the start of part 2.

Step through the whole sequence below. The timeline at the bottom shows the rails and POR_B coming up; it is simplified and not to scale.

<div class="bootviz" data-viz="poweron"><noscript><img src="{{ '/assets/img/boot/imx95-boot1-poweron.svg' | relative_url }}" alt="Static diagram of the i.MX95 power-on sequence, with eleven numbered steps from PMIC sequencing to the ELE firmware being verified"></noscript></div>

## Boot modes

The ROM's first decision is where to boot from. It has two inputs:

- **Boot-mode pins**, latched at reset. They are often shared with other functions, so the board has to hold them at the right levels while reset is asserted.
- **Boot fuses**, which select the boot device and its parameters (bus width, speed, controller instance) and can lock the configuration down.

Most SoCs combine them into three kinds of boot mode:

1. **Boot from fuses.** The fuses alone select the boot device. This is the normal setting for production hardware, because a stray switch setting can't change it.
2. **Normal boot.** The pins select the device directly: eMMC, SD, or SPI flash. Convenient during development.
3. **Serial download.** The ROM skips the boot media and waits for an image over USB.

The pin encodings differ between parts, even within one family, and how the pins reach a switch is a board decision. NXP's i.MX95 EVK has a four-position switch; the smaller FRDM board brings out only two of the pins. Always take the switch settings from your board's documentation, never from another board or another SoC.

When the selected device has no valid image, the ROM doesn't simply give up. A typical fallback order is:

1. The **primary** image on the selected device.
2. A **secondary** copy at another offset on the same device, if fuses enable it.
3. A **recovery** device such as a small SPI flash, if fuses enable it.
4. **USB serial download.**

On the i.MX95 the ROM resets the SoC between these attempts. On a scope, a failing board shows a burst of boot-device activity, a reset, another burst, and finally USB enumeration. Secured products often disable serial download by fuse; then a board with no valid image just stops.

## Boot devices: where the ROM reads

Once the device is chosen, the ROM brings up its controller and reads the first image header at a fixed location. That location differs per device type:

| Device  | Where the image starts (i.MX95)                    | Why                                                 |
| ------- | -------------------------------------------------- | --------------------------------------------------- |
| SD card | **32 KiB** from the start of the card              | leaves room for the partition table                 |
| eMMC    | offset 0 of a **boot** hardware partition          | the boot partitions sit outside the user area       |
| SPI NOR | after a small **configuration block** for the chip | the ROM needs to learn how to drive this flash chip |

The reasons hold for any SoC:

- **SD:** a GPT with the usual 128 entries fills the first 17 KiB of the card, so the boot image has to start after it. The first real partition starts well after the boot image, often at a few MiB. Writing the image is a single `dd`:

  ```bash
  sudo dd if=flash.bin of=/dev/sdX bs=1k seek=32 conv=fsync
  ```

  Forgetting `seek=32` is the classic mistake: it overwrites the partition table and leaves the ROM nothing to find.

- **eMMC:** the boot partitions (boot0, boot1) are separate hardware areas, outside the user area that holds your partition table. Nothing else lives there, and the image survives a reflash of the user area.
- **SPI NOR:** flash chips differ in commands, dummy cycles and maximum clock. The ROM starts in a slow mode that every chip supports, reads a configuration block from a known offset, then reconfigures the controller and reads the image. So a NOR image is a separate build with that block included. You can't write the SD image to NOR and expect it to boot.

On SD, you can see the start of this on a scope: the card is first identified with a clock of 400 kHz or less, as the SD specification requires, before the bus speeds up.

Pick a device in the figure below, then step through what the ROM does with it, including the fallback paths when there is no valid image:

<div class="bootviz" data-viz="bootdev"><noscript><img src="{{ '/assets/img/boot/imx95-boot1-bootdev.svg' | relative_url }}" alt="Static flowchart of how the i.MX95 BootROM picks a boot device, with storage layouts for SD, eMMC and SPI NOR and the fallback to serial download"></noscript></div>

The header check is shallow on purpose: the ROM checks that an image is there before it trusts anything inside it. The signature checks come next, through the secure enclave, and are the subject of part 2.

## Serial download

Serial download is how you recover a board with an empty or broken boot device. Select it with the boot switches rather than waiting for the ROM to fall back to it: that skips the failed attempts and works even if fallback is configured differently.

Each vendor has its own USB protocol and host tool for this. On the i.MX95, the ROM shows up on the host as a USB HID device with NXP's vendor ID `1fc9`, and NXP's **`uuu`** (Universal Update Utility) talks to it:

```bash
# Linux host: install udev rules once, so uuu doesn't need root
uuu -udev | sudo tee /etc/udev/rules.d/70-uuu.rules
sudo udevadm control --reload

# Is the ROM waiting?
lsusb | grep -i 1fc9

# Boot flash.bin into RAM, without writing anything
uuu flash.bin

# Write flash.bin to the eMMC boot partition
uuu -b emmc flash.bin

# Show what a built-in script really does on your uuu version
uuu -bshow emmc
```

The first command boots the bootloader over USB and changes nothing on the board, which makes it the quickest way to test a new `flash.bin`. The built-in `emmc` script boots the same image, then uses fastboot in the running U-Boot to write it to the eMMC boot partition and make that partition bootable. The scripts change between releases, so check yours with `uuu -bshow`.

## What this means when you debug a real board

Everything in this post happens before the first character on any UART. A silent board can be stuck anywhere from the PMIC to the secure enclave firmware, so work from the bottom up and measure instead of guessing:

| Symptom                                              | Look at first                                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| One or more rails missing or wrong                   | PMIC configuration, a fault the PMIC latched, a shorted rail. Measure every rail and read the PMIC fault registers |
| Rails fine, reset stays asserted                     | A rail just outside its power-good window, a supervisor holding reset, a missing pull-up on the reset line         |
| Reset released, boot device never accessed           | Boot switches (latched at reset), boot fuses, power to the boot device; check whether the board enumerates on USB  |
| Bursts of boot-device activity, then USB enumeration | No valid image: wrong offset, blank media, or an image built for another board or boot device                      |
| Board in serial download doesn't appear on the host  | Wrong USB port, a charge-only cable, USB supply problems, or serial download disabled by fuse                      |
| Image is read, nothing ever prints                   | Firmware for the wrong silicon revision, a signature failure, or a later stage failing with its debug output off   |

The wrong silicon revision is easy to hit on new parts: the i.MX95 has separate secure enclave firmware for early and production silicon, and an image built for one doesn't boot on the other. Check the marking on the chip against what you built.

Two habits save time at this stage. First, keep a known-good SD card around: if it boots, the hardware up to the ROM is fine, and the problem is in your image. Second, when you bring up a new board, scope the rails and the reset line once at power-on and save the trace. When a later board revision fails to boot, you have something to compare against.

## What's next

The ROM has found a valid image header and handed the secure enclave its firmware. Part 2 opens the image: how signed boot images are structured, what the enclave checks and with which keys, how the chain of trust continues, and how the i.MX95's `flash.bin` is put together.

## Sources

- [U-Boot documentation: i.MX95 EVK](https://docs.u-boot.org/en/latest/board/nxp/imx95_evk.html): firmware files, silicon revisions, the SD `dd` command
- [NXP, _i.MX 95 Applications Processors Data Sheet for Industrial Products_](https://www.nxp.com/docs/en/data-sheet/IMX95IEC.pdf): power-up sequence, boot modes
- NXP, _i.MX 95 Applications Processor Reference Manual_, "System Boot" chapter (available from NXP with an account)
- [NXP, Getting Started with the i.MX 95 19 mm × 19 mm EVK](https://www.nxp.com/document/guide/getting-started-with-the-i-mx-95-19-mm-x-19-mm-evk-board:GS-IMX95LPD5EVK-19) and [Getting Started with FRDM-IMX95](https://www.nxp.com/document/guide/getting-started-with-frdm-imx95:GS-FRDM-IMX95): boot switches, debug UARTs
- [nxp-imx/imx-mkimage](https://github.com/nxp-imx/imx-mkimage), [nxp-imx/imx-oei](https://github.com/nxp-imx/imx-oei), [nxp-imx/imx-sm](https://github.com/nxp-imx/imx-sm): the boot image and the M33 firmware (parts 2–4)
- [nxp-imx/mfgtools (uuu)](https://github.com/nxp-imx/mfgtools): USB IDs and built-in scripts
- SD Association, _Physical Layer Simplified Specification_: card identification at ≤ 400 kHz
- UEFI Forum, _UEFI Specification_, GPT chapter: partition table size and location

<script src="{{ '/assets/js/boot-viz.js' | relative_url | bust_file_cache }}" defer></script>
