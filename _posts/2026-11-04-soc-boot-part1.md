---
layout: post
title: "How an Embedded SoC Boots, Part 1: From Power to the First Instruction"
date: 2026-11-04 00:00:00
description: The first post in a series on how a modern embedded SoC boots, from power-on to Linux PID 1. What happens before any console output, from power sequencing and reset to the BootROM choosing a boot device.
tags: linux boot
categories: boot
giscus_comments: true
related_posts: false
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
2. The **OEI** (Optional Executable Image), which initializes the DRAM and returns to the ROM (part 3). NXP also uses OEIs for other early setup, such as TCM initialization, and the set of OEI images differs between A0 and B0 silicon.
3. The **System Manager**, which owns power, clocks and resets and serves the application cores over SCMI (part 4).

On the i.MX95, the firmware that owns the hardware runs on the small core that boots first, and the big application cores start later, as its clients. Several recent SoCs use a similar split, but it isn't universal: some put the system controller on a dedicated microcontroller that isn't the boot core, and many simply boot on an application core. Older i.MX parts are an example of the last kind. On the i.MX8M, for example, the ROM runs on the first Cortex-A53 core and the Cortex-M core is an optional extra. Which core runs the ROM is the first thing to find out for any new SoC, because it tells you where to look when nothing happens.

## Before the first instruction: power

Nothing runs until the power rails are up. A **PMIC** (power management IC) generates the board's rails from the input supply. Its **OTP** (one-time-programmable memory) holds the power-up sequence: which rails turn on, in which order, at what voltage and with what delay. NXP's reference power design for the i.MX95 splits this between two parts: a **PF09** PMIC, which sequences the board and supplies most of the rails, and **PF53** regulators for the high-current VDD_SOC and VDD_ARM rails (AN14910). NXP's 19 × 19 EVK follows it: its block diagram shows one PF09 and two PF53s, fed from the 12 V adapter through two FS5600 converters. The FRDM i.MX 95 Pro board does the same on a smaller scale, with a PF09 plus a PF5302 for VDD_SOC. Which PF53 feeds which rail on the EVK is in its schematic, not the block diagram. Other boards may use other PMICs; the principle is the same.

The order matters. Powering one domain before another can drive current through protection diodes into an unpowered domain, or leave a block in an undefined state. Every SoC datasheet specifies its own power-up sequence. The i.MX95's, simplified, goes like this, and other SoCs follow a similar pattern with different details:

1. The **always-on** domain (the battery-backed BBSM supply) comes up first and goes down last.
2. The **core logic** rails: VDD_SOC for the SoC logic, and VDD_ARM for the A55 cluster.
3. The 0.8 V analog, PLL and PHY supplies, and then the 1.8 V supplies.
4. The SoC's **DRAM interface** rails, VDD2H_DDR and then VDDQ_DDR. The memory chip has its own rails (VDD1, VDD2H, VDD2L, VDDQ) and its own power-up order, defined by the LPDDR5 standard (JESD209-5) and the memory datasheet. Its 1.8 V VDD1 comes up first, so it usually shares the 1.8 V step above. The PMIC sequence has to satisfy both the SoC and the memory.
5. The 3.3 V I/O, and the SD card's switchable I/O supply.
6. **Reset release**: the power-on reset input, POR_B, is held asserted for the whole sequence and released once every rail is in regulation. On NXP's reference designs the PMIC drives it; a board can also use a separate supervisor.

The core voltage isn't one fixed number. The i.MX95 datasheet lists different VDD_SOC values for different drive modes, so the value you measure depends on the part, the PMIC configuration and the firmware. Compare it with your schematic, not with another board.

When POR_B is released, the SoC latches its **boot-mode pins**. Changing the boot switches after this has no effect until the next power-on reset.

From here on, the DRAM is **powered but unusable**. It holds nothing, and the DDR controller can't talk to it reliably until it has been initialized and the link trained, which happens later (part 3). Until then, all code and data live in on-chip memory.

## The BootROM

The **BootROM** is mask ROM inside the SoC. It is fixed in silicon and can't be updated; fuses can only adjust what it does. Out of reset, the boot core fetches its first instruction from it. On the i.MX95 the A55 cluster and the M7 stay in reset, while the ELE starts its own ROM in parallel (more below).

The ROM's world is small:

- **Code** runs from ROM.
- **Working memory** is on-chip RAM. On the i.MX95 the ROM keeps its own stack and data in a reserved part of the M33's tightly coupled memory (TCM). The images it loads go to the load addresses given in the image headers: the M33 firmware into the TCM, the A55's SPL into the general-purpose on-chip RAM (OCRAM). DRAM is off limits until it has been initialized.
- **It prints nothing.** The i.MX95's ROM doesn't use a UART at all (the reference manual's list of hardware the ROM uses has none). Many other BootROMs are silent too, but not all, so check your part. On the i.MX95, the first console output comes from later firmware, and only if it was built with a console enabled.

Which console prints first depends on the BSP:

| Stage                            | Console on the i.MX95 | Prints when                                 |
| -------------------------------- | --------------------- | ------------------------------------------- |
| BootROM                          | none                  | never                                       |
| OEI, System Manager              | M33 debug UART        | when built with debug output, or by default |
| SPL, TF-A, OP-TEE, U-Boot, Linux | A55 console UART      | depends on each one's console configuration |

On a board with a debug USB port, several UARTs often come out of one USB-serial chip. Find out which one belongs to which core before you decide a board is dead: on the i.MX95 the earliest output, if any, comes from the OEI or the System Manager on the M33 UART, not on the Linux console.

At the same time, the **secure enclave** (the ELE on the i.MX95) comes out of reset and runs its own internal ROM. The two ROMs work together: the M33 ROM fetches images from the boot device, and the ELE ROM handles secure boot, starting with the NXP-signed ELE firmware in the first container. Once that firmware runs, the ELE also provides runtime services (key storage, crypto, fuse access) to the later stages. The boot image holds more than the ELE firmware: a second container carries the OEI, the System Manager, the A55 bootloader and optional M7 firmware. Loading and authenticating the first container is the last step of this post and the start of part 2.

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

When the selected device has no valid image, many ROMs try other sources before giving up. The i.MX95 reference manual documents this order:

1. The **primary** image set on the primary boot device: SD, eMMC, FlexSPI NOR or SPI NAND.
2. A **secondary** image set on the same device, at an offset set by fuses, if those fuses are programmed.
3. A **recovery** device: a serial NOR flash or EEPROM on LPSPI1 or LPSPI2, only if a fuse enables recovery.
4. **USB serial download**, on USB1 (some parts use USB2 instead), unless a fuse disables it.

Between stages, the i.MX95 ROM records the next stage in a reset-controller register and resets the SoC. So I'd expect a board with no valid image to access its boot device, reset, try again, and eventually enumerate on USB; I haven't captured this on a scope myself. On a secured product with serial download disabled, a board with no valid image just stops. Which stages are active depends on the fuses, so the exact behaviour differs between boards, and NXP's documentation is per silicon revision.

## Boot devices: where the ROM reads

Once the device is chosen, the ROM brings up its controller and reads the first image header at a fixed location. That location differs per device type:

| Device  | Where the image starts (i.MX95)                    | Why                                                 |
| ------- | -------------------------------------------------- | --------------------------------------------------- |
| SD card | **32 KiB** from the start of the card              | fixed by the ROM; clears the partition table        |
| eMMC    | offset 0 of a **boot** hardware partition          | the boot partitions sit outside the user area       |
| SPI NOR | after a small **configuration block** for the chip | the ROM needs to learn how to drive this flash chip |

The offsets themselves are fixed by each SoC's ROM, but the reasoning behind them carries over:

- **SD:** 32 KiB is where the i.MX95 ROM looks; it's part of the documented boot-image layout, not something you choose. A useful side effect is that the image doesn't collide with the partition table: a GPT with the usual 128 entries fills the first 17 KiB of the card. The offset differs between families: the i.MX6 and i.MX7 read the image at 1 KiB, which clashes with a GPT; the i.MX8MQ and i.MX8MM use 33 KiB; the i.MX8MN, i.MX8MP, i.MX8QXP and i.MX93 use 32 KiB, like the i.MX95. The first real partition starts well after the boot image, often at a few MiB. Writing the image is a single `dd`:

  ```bash
  sudo dd if=flash.bin of=/dev/sdX bs=1k seek=32 conv=fsync
  ```

  Forgetting `seek=32` is the classic mistake: it overwrites the partition table and leaves the ROM nothing to find.

- **eMMC:** an eMMC has two boot partitions (boot0, boot1) and a user area, all separate hardware areas. A setting in the eMMC itself (`PARTITION_CONFIG`, set with `mmc partconf` in U-Boot) selects which one it boots from. The bootloader usually goes in the selected boot partition, often boot0, where nothing else lives and it survives a reflash of the user area. The i.MX95 ROM can also boot from the user area, at 32 KiB like SD.
- **SPI NOR:** flash chips differ in commands, dummy cycles and maximum clock. The ROM starts in a slow mode that every chip supports, reads a configuration block from a known offset, then reconfigures the controller and reads the image. On the i.MX95 this is the FlexSPI Configuration Block (FCB), with the read settings for that flash chip. `imx-mkimage`'s FlexSPI target (`make flash_a55_flexspi`) generates it and places it at 1 KiB, before the image at 4 KiB. So a NOR image is a separate build. You can't write the SD image to NOR and expect it to boot.

On SD, the SD specification requires the host to identify the card with a clock of 400 kHz or less. Then it raises the clock according to what the card and controller support. That slow start is the first thing to look for with a scope on the SD clock line.

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
sudo udevadm trigger   # or replug the board

# Is the ROM waiting?
lsusb | grep -i 1fc9

# Boot flash.bin into RAM, without writing anything
uuu flash.bin

# Write flash.bin to the eMMC boot partition
uuu -b emmc flash.bin

# Show what a built-in script really does on your uuu version
uuu -bshow emmc
```

The first command loads the bootloader into RAM over USB and changes nothing on the board's storage, which makes it the quickest way to test a new `flash.bin`. `-b` selects one of uuu's built-in scripts. The `emmc` script boots the same image, then uses fastboot in the running U-Boot to write it to the eMMC boot partition and select that partition with `mmc partconf`. That needs a U-Boot with fastboot support, which NXP's BSP builds have. A related script, `emmc_all`, also writes a full disk image (for example a Yocto `.wic`) to the eMMC user area. The scripts and the U-Boot side change between uuu and BSP releases, so check yours with `uuu -bshow`.

## What this means when you debug a real board

Most of what this post covers happens before the A55 console is up. On the i.MX95 nothing in this post prints: the ROM is silent, and the earliest possible output comes from the OEI or the System Manager on the M33 UART, and only if they were built with debug output. A silent board can be stuck anywhere from the PMIC to the secure enclave firmware, so work from the bottom up and measure instead of guessing:

| Symptom                                             | Look at first                                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| One or more rails missing or wrong                  | PMIC configuration, a fault the PMIC latched, a shorted rail. Measure every rail and read the PMIC fault registers |
| Rails fine, reset stays asserted                    | A rail just outside its power-good window, a supervisor holding reset, a missing pull-up on the reset line         |
| Reset released, boot device never accessed          | Boot switches (latched at reset), boot fuses, power to the boot device; check whether the board enumerates on USB  |
| Boot device read, then USB enumeration              | No valid image: wrong offset, blank media, or an image built for another board or boot device                      |
| Board in serial download doesn't appear on the host | Wrong USB port, a charge-only cable, USB supply problems, or serial download disabled by fuse                      |
| Image is read, nothing ever prints                  | A later stage failing with its debug output off, or a signature failure on a closed (secured) part                 |

Signature failures don't always stop the boot. On a part whose lifecycle is still OEM open, which covers most development boards, the ELE logs authentication failures of your own images and boots them anyway. Only an OEM-closed part refuses them. The ELE firmware itself is different: it is NXP-signed and always checked.

That makes the wrong silicon revision a trap on new parts, because firmware images can be revision-specific. The U-Boot documentation for the i.MX95 EVK lists separate ELE firmware containers for A0 and B0 silicon, and an image built for one doesn't boot on the other. I expect that to look like the "no valid image" row above, with the ROM falling back to serial download, but I haven't tested it on a board. Check the marking on the chip against what you built.

Two habits save time at this stage. First, keep a known-good SD card around: if it boots, the hardware up to the ROM is fine, and the problem is in your image. Second, when you bring up a new board, scope the rails and the reset line once at power-on and save the trace. When a later board revision fails to boot, you have something to compare against.

## What's next

The ROM has found a valid image header and handed the secure enclave its firmware. Part 2 opens the image: how signed boot images are structured, what the enclave checks and with which keys, how the chain of trust continues, and how the i.MX95's `flash.bin` is put together.

## Sources

- [U-Boot documentation: i.MX95 EVK](https://docs.u-boot.org/en/latest/board/nxp/imx95_evk.html): firmware files, silicon revisions, the SD `dd` command
- [NXP, _i.MX 95 Applications Processors Data Sheet for Industrial Products_](https://www.nxp.com/docs/en/data-sheet/IMX95IEC.pdf): power-up sequence, operating voltages, boot modes
- NXP, _i.MX 95 Applications Processor Reference Manual_, "System Boot" chapter (available from NXP with an account): boot stages and fallback, ROM memory use, image offsets, ELE ROM, recovery and serial download devices
- [NXP, i.MX 95 19 × 19 mm EVK block diagram](https://www.nxp.com/assets/block-diagram/en/IMX95LPD5EVK-19.pdf): PF09, 2× PF53 and FS5600 power parts, boot devices
- [NXP, PF09 product page](https://www.nxp.com/products/PF09), AN14910 _PF09 PMIC Hardware Design Guidelines_ and UM12527 _FRDM-IMX95-PRO Board User Manual_: PF09/PF53 power architecture
- [NXP, Getting Started with the i.MX 95 19 mm × 19 mm EVK](https://www.nxp.com/document/guide/getting-started-with-the-i-mx-95-19-mm-x-19-mm-evk-board:GS-IMX95LPD5EVK-19) and [Getting Started with FRDM-IMX95](https://www.nxp.com/document/guide/getting-started-with-frdm-imx95:GS-FRDM-IMX95): boot switches, debug UARTs
- [nxp-imx/imx-mkimage](https://github.com/nxp-imx/imx-mkimage), [nxp-imx/imx-oei](https://github.com/nxp-imx/imx-oei), [nxp-imx/imx-sm](https://github.com/nxp-imx/imx-sm): the boot image and the M33 firmware (parts 2–4)
- [nxp-imx/mfgtools (uuu)](https://github.com/nxp-imx/mfgtools): USB IDs and the built-in `emmc` and `emmc_all` scripts
- JEDEC, _JESD209-5: Low Power Double Data Rate 5 (LPDDR5)_, and your memory vendor's datasheet: DRAM rails and power-up sequence
- SD Association, _Physical Layer Simplified Specification_: card identification at ≤ 400 kHz
- UEFI Forum, _UEFI Specification_, GPT chapter: partition table size and location

<script src="{{ '/assets/js/boot-viz.js' | relative_url | bust_file_cache }}" defer></script>
