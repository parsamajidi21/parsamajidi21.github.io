---
layout: post
title: "How an Embedded SoC Boots, Part 2: Signed Boot Images and the Secure Enclave"
date: 2026-11-10 00:00:00
description: The second post in a series on how a modern embedded SoC boots. How the boot ROM decides whether to trust an image, what a signed boot container looks like, and what is inside the i.MX95's flash.bin.
tags: linux boot
categories: boot
giscus_comments: true
related_posts: false
pretty_table: true
toc:
  sidebar: left
---

<!-- prettier-ignore-start -->
> **TL;DR**: Secure boot is a **chain of trust**: every stage checks the next one's signature before it jumps to it, starting from code and keys that can't be changed. On the i.MX95 the roots are NXP's key inside the secure enclave's ROM and a **hash of your public keys burned into fuses**. The boot image, `flash.bin`, is a row of signed **containers**: NXP's enclave firmware first, then your M33 firmware and SPL, then TF-A and U-Boot, which SPL loads and checks later. Until you **close** the part, failed checks are only logged.
{: .block-tip }

<!-- prettier-ignore-end -->

## Where part 1 left off

[Part 1]({% post_url 2026-11-04-soc-boot-part1 %}) followed the boot from power-on to the moment the boot ROM finds a valid image header on the boot device. This post is about what the ROM does next: how it decides whether to trust the image, what the image looks like inside, and where its pieces end up.

| Part  | Topic                                                                   |
| ----- | ----------------------------------------------------------------------- |
| 1     | From power to the first instruction: PMIC, reset, BootROM               |
| **2** | **Signed boot images and the secure enclave (this post)**               |
| 3     | Waking up the DRAM: initialization and training                         |
| 4     | The system controller firmware and SCMI                                 |
| 5     | SPL → TF-A → OP-TEE → U-Boot: exception levels and hand-offs            |
| 6     | Linux takes over, plus a "last console line → failed stage" cheat sheet |

As before, the ideas are general and the i.MX95 is the worked example. The details come from NXP's `imx-mkimage` source, the AHAB documentation and code in NXP's U-Boot, and the i.MX95 reference manual.

## Why a boot image needs a signature

A boot ROM could check an image with a checksum or a hash. That catches a corrupted flash, but not an attacker: anyone who can change the image can also fix up its hash. To decide whether an image is _authentic_, the device needs public-key cryptography. You sign the image offline with a private key that never leaves your build server, and the device verifies the signature with the matching public key.

Each stage has to check the next before it jumps to it, because once untrusted code runs, it can do anything the stage before it could. That gives a **chain of trust**: the ROM checks the first bootloader, the bootloader checks the next one, and so on up to the kernel. The first link has to be something an attacker can't change, and on a SoC that means code in mask ROM.

Every vendor builds the same chain in its own way. Older NXP parts (i.MX6, i.MX7, i.MX8M) use **HAB**; the i.MX8, i.MX8X, i.MX8ULP and i.MX9 families use **AHAB**, where a separate security subsystem does the checking. Arm's Trusted Firmware-A has its own trusted boot scheme based on X.509 certificates. The rest of this post uses AHAB on the i.MX95, but the questions are the same everywhere: where are the keys, what is signed, and who checks what.

## The root of trust: ROM code and a key hash in fuses

The ROM needs a public key it can trust, and the obvious place to keep it is in fuses. Fuses are expensive, though, and a public key is large. So most designs burn only a **hash** of the public keys. The keys themselves travel inside the boot image, and the ROM accepts them only if their hash matches the fuses. Swapping in your own keys doesn't help an attacker, because the hash won't match.

AHAB works this way. You generate up to four **Super Root Keys** (SRKs) with NXP's Code Signing Tool. Their public halves go into an **SRK table** inside every signed container, and the SHA-256 hash of that table goes into the SoC's 256-bit `SRK_HASH` fuses. Having four keys means one can be revoked if it leaks, without changing the fuses.

The i.MX95 has a second root: NXP's own public key, built into the **EdgeLock Secure Enclave (ELE)** ROM. It is used for one thing, checking the ELE firmware that NXP signs and ships. So there are two roots of trust on the chip, NXP's and yours.

The last piece is the **lifecycle**, a state kept in fuses that says how strict the chip should be:

- **OEM open**: the ELE runs every check and records failures as events, but boots the image anyway. Every development board is in this state, and it is how you test a signed image without risking the board.
- **OEM closed**: a failed check stops the image. You move a part here with U-Boot's `ahab_close` command once a signed image boots cleanly, and there is no way back.

U-Boot's `ahab_status` command shows both: on an i.MX95 it prints `Lifecycle: 0x00000010, OEM Open` (or `0x00000040, OEM closed`), followed by any events the ELE has recorded.

## Containers: what is actually signed

A signed boot image needs more than a signature appended to a binary. The ROM has to know which images are inside, where each one goes in memory, which core runs it, and which bytes the signature covers. AHAB puts all of that into a **container**:

- A **header** with a tag, version and length, some flags, two version numbers and an image count.
- An **image table**, one entry per image: its offset in the file, its size, its load address and entry point, flags (image type, target core, hash algorithm) and a **hash** of the image. `imx-mkimage` uses SHA-384 by default.
- A **signature block** with the SRK table, the signature, and an optional certificate for a subordinate signing key, so the SRKs themselves can stay offline.

The signature covers the header, the image table and the SRK table, but **not the images**. They are covered through their hashes in the signed table. That keeps the expensive signature check to one small block per container. The images are only hashed, and the ELE can check each one as it is loaded.

The two version numbers serve different purposes. `fuse_version` is the anti-rollback counter: the ELE refuses a container whose `fuse_version` is lower than a counter in fuses, so you can retire an old, vulnerable image by burning that counter forward. `sw_version` is a software version number that tools and the boot flow can use.

## What's inside the i.MX95 flash.bin

Here is the image from part 1, opened up. It holds three containers, and the boot ROM only reads the first two.

<div class="bootviz" data-viz="flashbin"><noscript><img src="{{ '/assets/img/boot/soc-boot2-flashbin.svg' | relative_url }}" alt="Static diagram of an i.MX95 flash.bin with three containers, the fields of container 2, and where each image is loaded"></noscript></div>

**Container 1: the ELE firmware.** NXP builds and signs it, and you include it unchanged from NXP's firmware package. It is specific to the silicon revision: `mx95a0-ahab-container.img` for A0 and `mx95b0-ahab-container.img` for B0. This is the revision trap from part 1's debug table.

**Container 2: your M33 firmware and SPL.** In NXP's BSP build (with the OEI enabled) it holds:

| Image                                               | Load address           | Runs on |
| --------------------------------------------------- | ---------------------- | ------- |
| OEI (one or two, depending on the silicon revision) | `0x1FFC0000` (M33 TCM) | M33     |
| System Manager                                      | `0x1FFC0000` (M33 TCM) | M33     |
| SPL                                                 | `0x20480000` (OCRAM)   | A55     |

The OEI and the System Manager have the same load address on purpose. The ROM loads the OEI and runs it, the OEI trains the DRAM and returns (part 3), and then the System Manager overwrites it. Configurations with M7 firmware add an M7 image to the same container.

The container headers sit back to back at the start of the file, at offset 0 and `0x400`, and the images follow. Some configurations add a third header at `0x800`, for V2X firmware or a placeholder for it.

**Container 3: TF-A, U-Boot and optionally OP-TEE.** `imx-mkimage` builds it separately as `u-boot-atf-container.img` and appends it to `flash.bin` at the next 1 KiB boundary. The boot ROM never reads it. SPL does, after the OEI has trained the DRAM: TF-A goes to `0x8A200000` and U-Boot to `0x90200000` in NXP's defaults.

How SPL handles container 3 matters for security. It copies the header into memory, asks the ELE to authenticate it, and from then on uses only that checked copy. Each image is then loaded and checked against its hash before SPL jumps to TF-A. All of this lives in U-Boot's `CONFIG_AHAB_BOOT` code. **Without that option, SPL loads container 3 without checking it**, and the chain ends at SPL.

There are two ways to build this image:

- **NXP's BSP** uses `imx-mkimage`. You copy the firmware, SPL, U-Boot and TF-A into `iMX95/` and run a target such as `make SOC=iMX95 REV=B0 OEI=YES flash_a55`. Each target is a single `mkimage` call that lists the images, the target cores and the load addresses.
- **Upstream U-Boot** builds `flash.bin` itself with binman, using the `nxp-imx9image` entry type. You copy the same firmware files into the U-Boot tree and run `make`, as the U-Boot i.MX95 EVK documentation describes. The result has the same container layout.

## Following the chain of trust

Pick a scenario in the figure below to see what happens when a check passes, and when it fails on an open and on a closed part.

<div class="bootviz" data-viz="trust"><noscript><img src="{{ '/assets/img/boot/soc-boot2-trust.svg' | relative_url }}" alt="Static diagram of the i.MX95 chain of trust, from NXP's key and the SRK hash in fuses through the ELE firmware, container 2, SPL and container 3 to the kernel"></noscript></div>

The roles split cleanly. The **M33 boot ROM** reads the containers and loads the images, but makes no trust decisions itself. The **ELE** makes every decision: its ROM checks the ELE firmware with NXP's key, and its firmware checks container 2 for the boot ROM and container 3 for SPL with your keys. Past U-Boot, the ELE is out of the picture: U-Boot checks the kernel itself, with a signed FIT image, or asks the ELE to check an OS container. That link is part 6.

## Signing in practice

A full signing walkthrough is longer than this post, and NXP's AHAB guides in the U-Boot source cover it step by step. This is the order of operations, and why each step comes where it does:

1. **Generate the keys** with the Code Signing Tool's `ahab_pki_tree.sh`, and the SRK table and its hash with `srktool`. Keep the private keys somewhere safer than the build machine, such as an HSM or an offline machine.
2. **Sign container 3 first.** It is built on its own (`make SOC=iMX95 u-boot-atf-container.img`), signed with `cst`, and copied back under the same name, because `flash.bin` is assembled from that file.
3. **Build `flash.bin` and sign container 2.** `mkimage` prints the container and signature block offsets, and the CST input file (the CSF) needs them.
4. **Burn the SRK hash** with U-Boot's `fuse prog` on the fuse words for your part. An error here leaves you with a part that can never boot a signed image, so check the values twice.
5. **Boot the signed image on the still-open part** and run `ahab_status`. It must say `No Events Found!`.
6. **Close the part** with `ahab_close`, only after step 5 is clean.

<!-- prettier-ignore-start -->
> **Closing is irreversible.** On a closed part, every image has to be signed with keys that match the fuses, including images you load over USB serial download. A wrong SRK hash or a missing signature on a closed part leaves the board unable to boot.
{: .block-warning }

<!-- prettier-ignore-end -->

## What this means when you debug a real board

| Symptom                                                       | Look at first                                                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Image is read, then the boot ROM moves to its next boot stage | ELE container for the wrong silicon revision, or on a closed part, a container that fails its check                      |
| Board boots, `ahab_status` lists events                       | Unsigned container, wrong keys, or an SRK hash that doesn't match the fuses. Harmless on an open part, fatal once closed |
| SPL starts, U-Boot never does                                 | Container 3 missing or at the wrong offset, DRAM not trained, or container 3 failing its check with `CONFIG_AHAB_BOOT`   |
| Signed image boots on one board, not on another               | Different lifecycle or SRK fuses between the boards; compare their `ahab_status` output                                  |
| Board boots with an unsigned image you expected it to refuse  | The part is still OEM open                                                                                               |

The last row is the one to remember. On an open part, signing mistakes don't stop anything, so they are easy to miss until the day the part is closed. Make `ahab_status` part of your test before you close the first production board.

## What's next

Container 2 has been checked and its first image, the OEI, is about to run on the M33. Part 3 follows it: what it takes to bring up LPDDR5, what the training firmware does, and why the DRAM can't be used until it is done.

## Sources

- [nxp-imx/imx-mkimage](https://github.com/nxp-imx/imx-mkimage), `iMX95/soc.mak` and `src/imx8qxb0.c`: container targets, load addresses, the container 3 alignment, container and signature block fields, the default hash algorithm
- [nxp-imx/uboot-imx](https://github.com/nxp-imx/uboot-imx): `doc/imx/ahab/introduction_ahab.txt` and `doc/imx/ahab/guides/mx8ulp_9x_secure_boot.txt` (AHAB concepts, the i.MX95 image layout, signing and fusing steps, `ahab_close`); `arch/arm/mach-imx/ele_ahab.c` (`ahab_status`, lifecycle values, container 3 authentication); `common/spl/spl_imx_container.c` (SPL loading container 3)
- [U-Boot documentation: i.MX95 EVK](https://docs.u-boot.org/en/latest/board/nxp/imx95_evk.html) and `arch/arm/dts/imx95-u-boot.dtsi` in upstream U-Boot: firmware files per silicon revision, the binman build
- NXP, _i.MX 95 Applications Processor Reference Manual_, "System Boot" chapter (available from NXP with an account): image container sets, ROM image validation through the ELE ROM, the boot flow after a validation error
- NXP, Code Signing Tool (CST) and its AHAB user guide, available from NXP with an account: key generation and container signing

<script src="{{ '/assets/js/boot-viz.js' | relative_url | bust_file_cache }}" defer></script>
