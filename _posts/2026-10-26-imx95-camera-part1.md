---
layout: post
title: "Cameras on i.MX95, Part 1: From Photons to /dev/video"
date: 2026-10-26 00:00:00
description: The first post in a series on embedded cameras on the NXP i.MX95. How a MIPI CSI-2 camera like the onsemi AR2020 gets an image into memory, block by block, with interactive diagrams.
tags: linux camera
categories: camera
giscus_comments: true
related_posts: false
pretty_table: true
toc:
  sidebar: left
---

<!-- prettier-ignore-start -->
> **TL;DR**: A camera on an embedded board is two links, not one: **I²C** to configure the sensor, and **MIPI CSI-2** to stream pixels. On the i.MX95 the pixels go through a D-PHY receiver, a CSI-2 controller, a pixel formatter and the **ISI**, which writes frames to memory. If the sensor outputs RAW Bayer data, the **NEO-ISP** turns it into an image, and **libcamera** ties everything together. This post walks through each step, with interactive diagrams.
{: .block-tip }

<!-- prettier-ignore-end -->

## About this series

For a while now my day job has involved cameras on the NXP **i.MX95**: porting a third-party vendor kernel driver for an **onsemi AR2020** image sensor, and writing the device tree that connects it to the SoC. Camera bring-up has a reputation for being hard, and part of the reason is that the knowledge is scattered across sensor datasheets, MIPI specifications, kernel documentation and vendor guides. This series is my attempt to put what I have learned in one place, in the order I wish I had learned it.

| Part  | Topic                                                                          |
| ----- | ------------------------------------------------------------------------------ |
| **1** | **The big picture: from photons to `/dev/video` (this post)**                  |
| 2     | The sensor driver: a V4L2 subdevice, power-up sequence, registers and controls |
| 3     | The device tree: describing the camera, endpoints, lanes and link frequency    |
| 4     | Bring-up and debugging with `media-ctl`, `v4l2-ctl` and the media graph        |
| 5     | libcamera and the NEO-ISP: from RAW to a good-looking image                    |

This first part has no driver code. It builds the mental model the rest of the series hangs on: what each piece of hardware does, and why the Linux side is shaped the way it is.

## Two links, not one

The first thing to understand about a MIPI camera is that it talks to the SoC over **two separate interfaces**:

- **I²C, for control.** The sensor is an I²C device with hundreds of registers. Through them, the driver sets the resolution, frame rate, exposure time and analog gain, and starts or stops streaming. I²C is slow (hundreds of kHz), which is fine because it only carries a few bytes per frame.
- **MIPI CSI-2, for data.** The pixels themselves flow over high-speed differential lanes at gigabits per second, in one direction only, from sensor to SoC.

Around those two links there are a few more signals that a driver has to get right: power supplies (typically separate analog, digital and I/O rails), an input clock for the sensor (often called **MCLK** or EXTCLK), and reset or power-down GPIOs. Most "the camera doesn't probe" problems are one of these, long before any pixel moves.

<!-- prettier-ignore-start -->
> **Debugging rule of thumb.** If the driver can't read the sensor's chip ID over I²C, the problem is power, clock, reset or the I²C address, not CSI-2. NXP's porting guide lists the same order: supplies, MCLK, reset and power sequence.
{: .block-tip }

<!-- prettier-ignore-end -->

## The AR2020 at a glance

The sensor in this series is the onsemi **AR2020**, part of onsemi's Hyperlux LP family:

| Property     | Value                                                             |
| ------------ | ----------------------------------------------------------------- |
| Resolution   | 20 MP, 5120 × 3840 active pixels                                  |
| Optical size | 1/1.8 inch                                                        |
| Pixel        | 1.4 µm, back-side illuminated (BSI)                               |
| Shutter      | Rolling shutter                                                   |
| Color        | RGB Bayer color filter                                            |
| Output       | MIPI D-PHY, up to 2 × 4 lanes                                     |
| Max speed    | Full resolution at up to 60 fps in 10-bit linear mode             |
| Extras       | Binning/skipping, motion wake-up, enhanced near-infrared response |

Two of these lines matter a lot for the rest of the series. "Bayer" means the sensor's raw output is not a color image yet. And "up to 60 fps at full resolution" doesn't mean the SoC can take it: we'll check that with real numbers at the end of this post.

## From photons to RAW: the Bayer mosaic

Each pixel of an image sensor is a photodiode that counts light. It has no idea what color the light was. To get color, the sensor puts a tiny color filter on top of every pixel, in a repeating 2 × 2 pattern: one red, two green, one blue. This is the **Bayer pattern** (RGGB, or a shifted variant such as GRBG), and green appears twice because human vision is most sensitive to it.

So the sensor sends **one number per pixel**: the brightness behind that pixel's filter. In 10-bit mode that number is between 0 and 1023. This is what "RAW" or "RAW10" means. Turning that mosaic into a full-color image, by estimating the two missing colors at every pixel, is called **demosaicing**, and it is one of the main jobs of an ISP.

<div class="camviz" data-viz="bayer"><p>This interactive figure needs JavaScript.</p></div>

## MIPI CSI-2 on the wire

MIPI CSI-2 is really two layers:

- **D-PHY**, the physical layer. One **clock lane** plus one to four **data lanes**, each a differential pair. Lanes have two modes: a **low-power** mode used between lines and frames, and a **high-speed** mode for bursts of pixel data. Clocking is double data rate, so a lane running at 1.77 Gbps uses a clock of about 885 MHz. That number, the **link frequency**, will come back in the driver and the device tree.
- **CSI-2**, the protocol layer. The image is sent line by line in **packets**. Short packets mark frame start, frame end and, optionally, line start and line end. Each line of pixels travels in one **long packet**: a 4-byte header, the payload, and a 2-byte CRC.

The header's first byte, the **data identifier**, combines a **virtual channel** (which stream this belongs to, so several streams can share one link) and a **data type** (for example `0x2B` for RAW10, `0x1E` for YUV422 8-bit). The receiver uses these to decide what to do with the packet. RAW10 is also packed: four 10-bit pixels travel as five bytes, the first four holding the 8 most significant bits of each pixel, the fifth holding the remaining 2-bit pieces.

With several lanes, the transmitter stripes the packet bytes across them, round robin, and the receiver merges them back in order. More lanes means the same packet takes less time on the wire:

<div class="camviz" data-viz="lanes"><p>This interactive figure needs JavaScript.</p></div>

## Inside the i.MX95 camera domain

NXP calls the camera part of the i.MX95 the **camera domain**. It has two camera interfaces: one with its own D-PHY, and one whose D-PHY is shared with a display (DSI) output. Each has a CSI-2 controller and a pixel formatter, followed by the **ISI** (Image Sensing Interface) and the **NEO-ISP**.

Step through the pipeline below. The toggle at the top switches between the two kinds of camera you can connect.

<div class="camviz" data-viz="pipeline"><p>This interactive figure needs JavaScript.</p></div>

The toggle exists because there are two very different kinds of MIPI camera:

- A **RAW sensor** such as a bare AR2020 sends Bayer data. Something has to turn it into an image, and on the i.MX95 that is the **NEO-ISP**. The current NXP libcamera stack uses the ISP in **memory-to-memory** mode: the ISI first writes the RAW frame to DDR, then the ISP reads it back, processes it, and writes the final frame.
- A **"smart" camera module** has its own ISP chip next to the sensor and sends ready-made YUV. In that case the i.MX95 only needs the CSI-2 receiver and the ISI. Some vendors sell AR2020 modules like this: TechNexion's TEVS-AR2020, for example, integrates an ISP and can output both YUV and RAW.

Which kind you have changes almost everything above the sensor driver: which libcamera pipeline handler is used, whether you need ISP tuning files, and how you debug image quality. It is the first question to answer in any camera project.

## The software side: V4L2, the media controller and libcamera

Every hardware block above has its own Linux driver, and all of them use the kernel's **V4L2** (Video4Linux2) framework. Older V4L2 hardware was simple enough to hide behind a single `/dev/video0`. Modern SoC camera pipelines are not, so V4L2 splits them up:

- Each block (sensor, CSI-2 receiver, formatter, ISI, ISP) is a **V4L2 subdevice**, with its own `/dev/v4l-subdevN` node and **pads** where data comes in and goes out.
- The **media controller** API, through `/dev/mediaN`, exposes the whole graph: which entity is linked to which, and with what format on each pad.
- Only the blocks that touch memory, the ISI outputs and the ISP inputs and outputs, are **video devices** with `/dev/videoN` nodes.

Configuring all of that by hand is painful, which is why NXP's stack uses **libcamera** on top. It has two parts that matter here:

- A **pipeline handler** knows the platform's media graph and configures it. NXP provides one for the ISI-only path and one for the NEO-ISP path.
- An **IPA** (image processing algorithm) module runs the "3A" algorithms: auto exposure, auto white balance and, on some cameras, auto focus. It reads statistics from the ISP and writes new exposure and gain values back to the sensor driver, which sends them over I²C.

That last point is why a sensor driver for the NEO-ISP path has to expose a specific set of V4L2 controls. NXP's porting guide lists them: link frequency, pixel rate, horizontal and vertical blanking, exposure, analog gain, orientation and rotation. Without them libcamera can't calculate frame timing or run auto exposure. We'll implement these in Part 2.

## Will it fit? A bandwidth check

Before writing any code, check that the SoC can actually receive the camera mode you want. NXP's guide gives the method:

1. **Link bandwidth** = width × height × bits per pixel × fps × (1 + blanking). NXP suggests assuming **20%** blanking overhead if you don't have exact timings. Each i.MX95 camera interface can carry up to **10 Gbps**, which is **2.5 Gbps per lane** with four lanes.
2. **Pixel clock** = width × height × fps × (1 + blanking), divided by the pixels moved per clock cycle. The formatter, ISI and ISP all run from the `cam_isi_clk_root` clock: 333.33 MHz in low drive mode, 500 MHz nominal, 666.67 MHz in override mode. **RAW32 mode** moves 2 pixels per clock for RAW10/12 and 4 for RAW8. YUV and RGB always move 1 pixel per clock.

Try it with the AR2020's modes:

<div class="camviz" data-viz="bandwidth"><p>This interactive figure needs JavaScript.</p></div>

The full-resolution 30 fps RAW10 mode works out like this:

| Quantity                         | Calculation                 | Result                 |
| -------------------------------- | --------------------------- | ---------------------- |
| Link bandwidth                   | 5120 × 3840 × 10 × 30 × 1.2 | **7.08 Gbps** (≤ 10)   |
| Per lane, 4 lanes                | 7.08 / 4                    | **1.77 Gbps** (≤ 2.5)  |
| Link frequency                   | 1.77 / 2                    | **≈ 885 MHz**          |
| Pixel clock, RAW32 on (2 px/clk) | 5120 × 3840 × 30 × 1.2 / 2  | **354 MHz** (≤ 500)    |
| Pixel clock, RAW32 off           | 5120 × 3840 × 30 × 1.2      | **708 MHz** (> 666.67) |

Two lessons hide in that table. First, the 30 fps mode only fits **with RAW32 mode enabled**: without it, the camera domain clock can't keep up even in override mode. Second, the sensor's maximum of 60 fps at full resolution needs about 14 Gbps, more than one i.MX95 camera interface can carry, so that mode isn't usable here regardless of software. On the "smart module" path the picture changes again: YUV422 uses 16 bits per pixel and always moves one pixel per clock, so full-resolution YUV needs a much lower frame rate.

## Key terms

| Term             | Meaning                                                                      |
| ---------------- | ---------------------------------------------------------------------------- |
| Bayer / RAW      | Sensor output with one color sample per pixel, before demosaicing            |
| D-PHY            | MIPI physical layer: clock lane + data lanes, low-power and high-speed modes |
| CSI-2            | MIPI camera protocol: packets with data type and virtual channel             |
| Link frequency   | D-PHY clock, half the per-lane bit rate                                      |
| ISI              | i.MX Image Sensing Interface: writes frames to memory, converts, scales      |
| NEO-ISP          | i.MX95 image signal processor: RAW to image, plus statistics for 3A          |
| V4L2 subdevice   | A kernel driver for one block in the pipeline, with input and output pads    |
| Media controller | Kernel API describing the pipeline as a graph of linked entities             |
| Pipeline handler | libcamera component that configures one platform's media graph               |
| IPA / 3A         | Auto exposure, auto white balance and auto focus algorithms                  |

## What's next

Now that the path from sensor to memory is clear, Part 2 goes to the first box in the diagram: the **sensor driver**. We'll look at what a V4L2 subdevice driver for the AR2020 has to do, from the power-up sequence to the controls libcamera relies on, and at what changes when you port a driver written by a third-party vendor for another platform.

## References

- [NXP UG10215: i.MX 95x Camera Porting Guide](https://www.nxp.com/docs/en/user-guide/UG10215.pdf) (Rev. 2.5, September 2026)
- [onsemi AR2020 product page](https://www.onsemi.com/products/sensors/image-sensors/AR2020) and [datasheet](https://www.onsemi.com/download/data-sheet/pdf/ar2020-pd-d.pdf)
- [TechNexion TEVS-AR2020 camera module](https://www.technexion.com/product/tevs-ar2020/)
- [Linux kernel: Video4Linux (V4L2) driver API](https://docs.kernel.org/driver-api/media/index.html)
- [Linux kernel: Pixel data transmitter and receiver drivers (CSI-2)](https://docs.kernel.org/driver-api/media/tx-rx.html)
- [libcamera documentation](https://docs.libcamera.org/master/)
- [RidgeRun: NXP i.MX95 capture subsystem](https://developer.ridgerun.com/wiki/index.php/NXP_i.MX95_Technical_Guide/Capture_Subsystem)

<script src="{{ '/assets/js/camera-viz.js' | relative_url | bust_file_cache }}" defer></script>
