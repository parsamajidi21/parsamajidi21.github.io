---
layout: post
title: "Dynamic Layers in Yocto"
date: 2026-05-21 15:47:00
description: How BBFILES_DYNAMIC lets a Yocto layer ship optional recipes and bbappends that only activate when another layer is present, explained through meta-raspberrypi and a real i.MX95 BSP.
tags: yocto linux
categories: yocto
giscus_comments: true
related_posts: true
pretty_table: true
toc:
  sidebar: left
---

## Introduction

Hi, this is my first official blog post since my graduation. I've been working with Dynamic Layers in Yocto for a while, and I thought it would be a good idea to share what I've learned, since I remember there weren't many resources available on this topic when I was learning.

Throughout the post I use [meta-raspberrypi](https://git.yoctoproject.org/meta-raspberrypi/tree/dynamic-layers) as the main reference, because it is one of the cleanest real-world examples of the pattern. All its snippets are taken from the `master` branch (commit `863444d`, October 2026).

Then I'll show where I actually ran into dynamic layers: Ezurio's [meta-summit-som](https://github.com/Ezurio/meta-summit-som/tree/wrynose-summit-7.2.0.x/dynamic-layers), where I worked on the kernel recipes for the **NXP i.MX95** platform.

## The problem: optional integrations

Imagine you maintain a BSP layer for a board. The board has a camera, a GPU, and a few HATs, and you want good integration with the wider ecosystem:

- If the user builds with **meta-multimedia**, libcamera should be built with your board's camera pipeline enabled.
- If they use **meta-qt5**, `qtbase` should be configured for your GPU.
- If they use **meta-python**, a Python library for your sensor board should be available.

None of these layers is _required_ to boot the board, so you don't want to force them on every user. But a normal `.bbappend` has a sharp edge: if the recipe it appends to doesn't exist, BitBake stops with an error.

```text
ERROR: No recipes in default available for:
  /path/to/meta-mybsp/recipes-qt/qt5/qtbase_%.bbappend
```

Older releases let you downgrade this to a warning with `BB_DANGLINGAPPENDS_WARNONLY`, which also hid real mistakes. Current BitBake has dropped that escape hatch: a bbappend without a recipe is always fatal. So without dynamic layers you're left with two bad options:

1. Add every optional layer to `LAYERDEPENDS` and force users to download layers they don't need.
2. Split the integration into many small layers (`meta-mybsp-qt5`, `meta-mybsp-multimedia`, …) that users have to discover and add themselves.

Dynamic layers are the clean third option.

## What are Dynamic Layers?

A **dynamic layer** is a sub-directory of your layer whose recipes and bbappends are only parsed when a specific _other_ layer is part of the build. The mechanism is a single variable in `conf/layer.conf`: [`BBFILES_DYNAMIC`](https://docs.yoctoproject.org/ref-manual/variables.html#term-BBFILES_DYNAMIC).

Each entry has the form:

```text
<collection-name>:<file-glob>
```

- **`<collection-name>`** is the name another layer registers in its own `layer.conf` via `BBFILE_COLLECTIONS`. It is _not_ the directory name of the layer. For example, meta-oe registers itself as `openembedded-layer`.
- **`<file-glob>`** is the set of `.bb` / `.bbappend` files to add to `BBFILES`, but only if that collection is present.

If the collection isn't in the build, the files are simply never parsed. No dangling-append errors, and no extra dependencies.

The [BitBake manual](https://docs.yoctoproject.org/bitbake/bitbake-user-manual/bitbake-user-manual-ref-variables.html#term-BBFILES_DYNAMIC) also documents the inverse: prefixing the collection with `!` (e.g. `!clang-layer:...`) includes the files only when that layer is **absent**, which is handy for backfilling a recipe the other layer would otherwise provide.

## How meta-raspberrypi uses them

### The `layer.conf`

Here is the relevant part of `meta-raspberrypi/conf/layer.conf`:

```bitbake
BBFILE_COLLECTIONS += "raspberrypi"
BBFILE_PATTERN_raspberrypi := "^${LAYERDIR}/"
BBFILE_PRIORITY_raspberrypi = "9"

LAYERDEPENDS_raspberrypi = "core"

# The dynamic-layers directory hosts the extensions and layer specific
# modifications.
#
# The .bbappend and .bb files are included if the respective layer
# collection is available.
BBFILES_DYNAMIC += " \
    openembedded-layer:${LAYERDIR}/dynamic-layers/openembedded-layer/*/*/*.bb \
    openembedded-layer:${LAYERDIR}/dynamic-layers/openembedded-layer/*/*/*.bbappend \
    networking-layer:${LAYERDIR}/dynamic-layers/networking-layer/*/*/*.bb \
    networking-layer:${LAYERDIR}/dynamic-layers/networking-layer/*/*/*.bbappend \
    qt5-layer:${LAYERDIR}/dynamic-layers/qt5-layer/*/*/*.bb \
    qt5-layer:${LAYERDIR}/dynamic-layers/qt5-layer/*/*/*.bbappend \
    multimedia-layer:${LAYERDIR}/dynamic-layers/multimedia-layer/*/*/*.bb \
    multimedia-layer:${LAYERDIR}/dynamic-layers/multimedia-layer/*/*/*.bbappend \
    meta-python:${LAYERDIR}/dynamic-layers/meta-python/*/*/*.bb \
    meta-python:${LAYERDIR}/dynamic-layers/meta-python/*/*/*.bbappend \
"
```

Two things stand out:

- **The only hard dependency is `core`.** Everything else is optional.
- **Each sub-directory is named after the collection it depends on.** This isn't required by BitBake, but it's a convention worth copying: you can tell from the path which layer activates a file.

### The directory layout

The globs `*/*/*.bb` mean "recipe category / recipe name / file", the same structure as a normal layer:

```text
meta-raspberrypi/dynamic-layers/
├── meta-python/          # active only with meta-python
│   ├── recipes-connectivity/lirc/
│   ├── recipes-core/packagegroups/
│   └── recipes-devtools/python/
├── multimedia-layer/     # active only with meta-multimedia
│   └── recipes-multimedia/
│       ├── libcamera/
│       ├── libcamera-apps/
│       ├── libpisp/
│       └── rpidistro-vlc/
├── networking-layer/     # active only with meta-networking
│   └── recipes-support/drbd/
├── openembedded-layer/   # active only with meta-oe
│   ├── recipes-core/packagegroups/
│   └── recipes-devtools/python/
└── qt5-layer/            # active only with meta-qt5
    └── recipes-qt/qt5/
```

| Directory            | Activated by collection | Provided by layer |
| :------------------- | :---------------------- | :---------------- |
| `openembedded-layer` | `openembedded-layer`    | meta-oe           |
| `networking-layer`   | `networking-layer`      | meta-networking   |
| `multimedia-layer`   | `multimedia-layer`      | meta-multimedia   |
| `meta-python`        | `meta-python`           | meta-python       |
| `qt5-layer`          | `qt5-layer`             | meta-qt5          |

## What goes inside: four patterns

Looking through the dynamic-layers tree, the files fall into a few distinct patterns.

### 1. Tuning another layer's recipe for your hardware

`multimedia-layer/recipes-multimedia/libcamera/libcamera_%.bbappend`:

```bitbake
EXTRA_OEMESON:append:rpi = " -Dipas=rpi/vc4,rpi/pisp"
PACKAGECONFIG:append:rpi = " raspberrypi"
CXXFLAGS:append:rpi = " -Wno-unaligned-access "
```

libcamera comes from meta-multimedia. The bbappend enables the Raspberry Pi image processing algorithms (VC4 and PiSP). Without meta-multimedia there is no libcamera to append to, so the file must not be parsed. That's exactly what the dynamic layer guarantees.

Note the `:rpi` override: even when the dynamic layer is active, the changes only apply when building for a Raspberry Pi machine. **Activation by layer and activation by machine are two separate filters**, and good BSPs use both.

The `qt5-layer/recipes-qt/qt5/qtbase_%.bbappend` follows the same idea on a bigger scale. It selects `eglfs`/`gles2`/`kms` depending on `DISTRO_FEATURES` and `MACHINE_FEATURES`, and adds the right EGLFS device integration for the Pi GPU.

### 2. Shipping new recipes that need another layer

`multimedia-layer/recipes-multimedia/libcamera-apps/libcamera-apps_1.9.0.bb` is a full recipe, not an append:

```bitbake
PROVIDES += "rpicam-apps"

DEPENDS = "libcamera libexif jpeg tiff libpng boost"
```

It `DEPENDS` on `libcamera`, which only exists in meta-multimedia. If this recipe lived in the main layer, anyone building without meta-multimedia would get a "Nothing PROVIDES 'libcamera'" error as soon as something pulled it in. Placing it under `dynamic-layers/multimedia-layer/` ties its existence to its dependency.

The same goes for `libpisp`, the Pi-specific `rpidistro-vlc` build, and the Adafruit CircuitPython recipes under `openembedded-layer/`.

### 3. Opting out of something that doesn't work on your board

`networking-layer/recipes-support/drbd/drbd_%.bbappend`:

```bitbake
COMPATIBLE_MACHINE:rpi = "(null)"
```

Dynamic layers aren't only for adding things. Here meta-raspberrypi marks the drbd recipe from meta-networking as incompatible with Raspberry Pi machines. `openembedded-layer/recipes-core/packagegroups/packagegroup-meta-oe.bbappend` does something similar:

```bitbake
RDEPENDS:packagegroup-meta-oe-kernel:remove:rpi = "bpftool"
```

This drops `bpftool` from meta-oe's kernel packagegroup, but only for Pi machines.

### 4. Extending your own recipes when an optional layer is available

`meta-python/recipes-core/packagegroups/packagegroup-rpi-test.bbappend`:

```bitbake
RDEPENDS:${PN} += "python3-sense-hat"
```

This one is subtle. `packagegroup-rpi-test` lives in meta-raspberrypi's **own** main layer. The append adds `python3-sense-hat`, a recipe the dynamic layer itself provides, which in turn needs meta-python. So the test packagegroup automatically grows extra content when meta-python is there, and stays buildable when it isn't.

## Real-world example: meta-summit-som on i.MX95

My own hands-on experience with dynamic layers comes from Ezurio's [meta-summit-som](https://github.com/Ezurio/meta-summit-som/tree/wrynose-summit-7.2.0.x/dynamic-layers) (branch `wrynose-summit-7.2.0.x`), where I worked on the [kernel recipes](https://github.com/Ezurio/meta-summit-som/tree/wrynose-summit-7.2.0.x/dynamic-layers/imx-bsp/recipes-kernel) for the **i.MX95** platform. meta-raspberrypi shows the textbook version of the pattern; this layer shows what it looks like in a production BSP, and it uses dynamic layers in a way meta-raspberrypi doesn't.

### One layer, several vendor BSPs

Here is the `BBFILES_DYNAMIC` block from its `conf/layer.conf`:

```bitbake
BBFILES_DYNAMIC += " \
    fsl-bsp-release:${LAYERDIR}/dynamic-layers/imx-bsp/recipes-*/*/*.bb \
    fsl-bsp-release:${LAYERDIR}/dynamic-layers/imx-bsp/recipes-*/*/*.bbappend \
    meta-ti-bsp:${LAYERDIR}/dynamic-layers/ti-bsp/recipes-*/*/*.bb \
    meta-ti-bsp:${LAYERDIR}/dynamic-layers/ti-bsp/recipes-*/*/*.bbappend \
    summit-radio:${LAYERDIR}/dynamic-layers/summit-radio/recipes-*/*/*.bb \
    summit-radio:${LAYERDIR}/dynamic-layers/summit-radio/recipes-*/*/*.bbappend \
    meta-aws:${LAYERDIR}/dynamic-layers/aws/recipes-*/*/*.bb \
    meta-aws:${LAYERDIR}/dynamic-layers/aws/recipes-*/*/*.bbappend \
    "
```

In meta-raspberrypi, dynamic layers add _optional extras_ to a single-SoC BSP. Here they do something bigger: the **same layer supports SoMs built on both NXP i.MX and TI SoCs**, and the dynamic layers pick the right half:

- Build with NXP's BSP (`meta-imx`, whose `meta-imx-bsp` layer registers the `fsl-bsp-release` collection) and everything under `dynamic-layers/imx-bsp/` comes alive: U-Boot, ATF, the i.MX95 System Manager and OEI, security tooling, and the kernel.
- Build with TI's BSP (`meta-ti-bsp`) and `dynamic-layers/ti-bsp/` is used instead.
- Neither vendor BSP is a hard dependency of the layer.

Two details differ from meta-raspberrypi:

- **The directory names don't match the collection names.** `imx-bsp/` is activated by `fsl-bsp-release`, and `aws/` by `meta-aws`. That's perfectly legal, since BitBake only looks at the prefix before the colon. It's just less self-documenting, so you need `layer.conf` open to know what activates what.
- **The globs are stricter**: `recipes-*/*/*.bb` instead of `*/*/*.bb`, so stray directories that don't follow the `recipes-` naming are never parsed.

### Inside the i.MX kernel recipe

Everything kernel-related for the i.MX family lives in one append, `dynamic-layers/imx-bsp/recipes-kernel/linux-imx/linux-imx_%.bbappend`, next to a directory of patches and per-SoC files:

```text
recipes-kernel/linux-imx/
├── linux-imx_%.bbappend
└── linux-imx/
    ├── 0001-ts3a227-jack.patch
    ├── ...                         # ~50 kernel patches
    ├── mx8mm-generic-bsp/
    ├── mx8mp-generic-bsp/
    ├── mx91-generic-bsp/
    ├── mx93-generic-bsp/
    └── mx95-generic-bsp/
        ├── dts/freescale/          # i.MX95 device trees and overlays
        └── nitrogen_imx95_defconfig
```

The interesting part is how a single bbappend serves five SoCs. Here is a trimmed version:

```bitbake
FILESEXTRAPATHS:prepend := "${THISDIR}/${PN}:"

SRC_URI:append:summitsom = " \
    file://0001-ts3a227-jack.patch \
    ...
    file://dts \
    ${KERNEL_CONFIG_SUMMIT} \
    "

KERNEL_CONFIG_SUMMIT:mx8mm-generic-bsp = "file://nitrogen_imx8mm_defconfig"
KERNEL_CONFIG_SUMMIT:mx8mp-generic-bsp = "file://nitrogen_imx8mp_defconfig"
KERNEL_CONFIG_SUMMIT:mx91-generic-bsp = "file://nitrogen_imx91_defconfig"
KERNEL_CONFIG_SUMMIT:mx93-generic-bsp = "file://nitrogen_imx93_defconfig"
KERNEL_CONFIG_SUMMIT:mx95-generic-bsp = "file://nitrogen_imx95_defconfig"

do_patch:append:summitsom () {
    cp -af -t "${S}/arch/arm64/boot" "${UNPACKDIR}/dts"
}
```

Three mechanisms stack on top of each other here:

1. **Collection:** the whole file only exists in the build when NXP's BSP is present (the dynamic layer).
2. **Machine:** every change is guarded by the `:summitsom` override, so other i.MX machines in the same build tree are untouched.
3. **SoC:** `mx95-generic-bsp` is a machine override that meta-freescale adds for every i.MX95 machine. It does two jobs:
   - It selects the defconfig through `KERNEL_CONFIG_SUMMIT:mx95-generic-bsp`.
   - Because the fetcher searches override-named sub-directories first (via `FILESOVERRIDES`, which includes the machine overrides), the generic `file://dts` resolves to `linux-imx/mx95-generic-bsp/dts` on an i.MX95 build and to the matching directory for each other SoC. The `do_patch` append then copies those device trees into the kernel source tree.

On i.MX95 this matters a lot. `mx95-generic-bsp/dts/freescale/` holds a base carrier-board device tree plus a long list of overlays (`.dtso`): MIPI-CSI cameras (OV5640, OV5645, Arducam Pivariety), MIPI-DSI and LVDS panels, and M.2 Wi-Fi/Bluetooth modules over SDIO, UART, and PCIe. Each SoC keeps its own device trees and kernel config in its own folder, while the shared patches and build logic stay in one append. Adding a new SoC is mostly a matter of adding a new `mxNN-generic-bsp/` directory and one `KERNEL_CONFIG_SUMMIT` line.

### What it taught me

- **Dynamic layers are how a multi-vendor BSP stays a single layer.** Without them, the i.MX and TI halves would have to be separate layers, or the layer would have to depend on both vendors' BSPs.
- **The dynamic layer is only the first filter.** In practice I relied just as much on the machine override (`:summitsom`) and the SoC override (`mx95-generic-bsp`) to make sure a change hit exactly the boards I intended.
- **Know where a file comes from.** Between `FILESEXTRAPATHS`, override sub-directories, and dynamic layers, the same `file://dts` can mean five different directories. When something doesn't build, `bitbake -e linux-imx | grep ^FILESPATH=` and `bitbake-layers show-appends` answer "which file did BitBake actually pick?" faster than reading recipes.

## Adding a dynamic layer to your own layer

Say you maintain `meta-mybsp` and want optional Qt and meta-oe integrations.

**1. Create the directories**, named after the collections:

```text
meta-mybsp/
├── conf/layer.conf
├── recipes-bsp/...
└── dynamic-layers/
    ├── qt5-layer/
    │   └── recipes-qt/qt5/qtbase_%.bbappend
    └── openembedded-layer/
        └── recipes-support/my-tool/my-tool_1.0.bb
```

**2. Register them in `conf/layer.conf`:**

```bitbake
BBFILES_DYNAMIC += " \
    qt5-layer:${LAYERDIR}/dynamic-layers/qt5-layer/*/*/*.bb \
    qt5-layer:${LAYERDIR}/dynamic-layers/qt5-layer/*/*/*.bbappend \
    openembedded-layer:${LAYERDIR}/dynamic-layers/openembedded-layer/*/*/*.bb \
    openembedded-layer:${LAYERDIR}/dynamic-layers/openembedded-layer/*/*/*.bbappend \
"
```

**3. Find the right collection names.** Don't guess: read them from the other layer's `layer.conf`:

```bash
grep BBFILE_COLLECTIONS ../meta-openembedded/*/conf/layer.conf
```

**4. Verify it works** with and without the optional layer:

```bash
# Is the optional layer in the build?
bitbake-layers show-layers

# Are my appends actually applied?
bitbake-layers show-appends | grep -A3 qtbase

# Does my new recipe exist?
bitbake-layers show-recipes my-tool
```

Then remove the optional layer from `bblayers.conf` (`bitbake-layers remove-layer ...`) and parse again. The build should still work, and your dynamic recipes and appends should silently disappear.

## Tips and gotchas

- **Use collection names, not directory names.** `meta-qt5` registers `qt5-layer`; meta-oe registers `openembedded-layer`; NXP's `meta-imx-bsp` registers `fsl-bsp-release`. A typo here fails silently: the files just never get parsed. That's why the verification step above matters.
- **Keep `FILESEXTRAPATHS` relative to the append.** `FILESEXTRAPATHS:prepend := "${THISDIR}/${PN}:"` works the same inside a dynamic layer. Put patches and service files next to the bbappend, as meta-raspberrypi does for `lirc/lircd.service`.
- **Always add a machine override** (`:rpi`, `:mymachine`, …) to appends that change shared recipes. The dynamic layer controls _whether_ the file is parsed; the override controls _which builds_ it affects. Without it, your BSP tweaks leak into every other machine built from the same tree.
- **Don't hide hard dependencies here.** If your board can't boot without a layer, put it in `LAYERDEPENDS`. Dynamic layers are for optional integration only.
- **Match the directory depth to your globs.** `*/*/*.bb` expects exactly `recipes-xxx/name/file.bb`. A file one level deeper or shallower is silently ignored.

## Conclusion

Dynamic layers solve a real problem in a small amount of configuration. A BSP or product layer can integrate deeply with the wider OpenEmbedded ecosystem without forcing that ecosystem on every user. The recipe for doing it well, from both meta-raspberrypi and meta-summit-som, is short:

1. Keep `LAYERDEPENDS` minimal.
2. Put each optional integration under its own `dynamic-layers/` sub-directory, ideally named after the collection that activates it.
3. Register it in `BBFILES_DYNAMIC`.
4. Combine it with machine (and SoC) overrides so the changes only hit your hardware.

Next time you browse a BSP layer, open its `layer.conf` first. The `BBFILES_DYNAMIC` block tells you a lot about which parts of the ecosystem it was built to play with.

## References

- [meta-raspberrypi: dynamic-layers directory](https://git.yoctoproject.org/meta-raspberrypi/tree/dynamic-layers)
- [meta-raspberrypi: conf/layer.conf](https://git.yoctoproject.org/meta-raspberrypi/tree/conf/layer.conf)
- [meta-summit-som: dynamic-layers (`wrynose-summit-7.2.0.x`)](https://github.com/Ezurio/meta-summit-som/tree/wrynose-summit-7.2.0.x/dynamic-layers)
- [meta-summit-som: i.MX kernel recipes](https://github.com/Ezurio/meta-summit-som/tree/wrynose-summit-7.2.0.x/dynamic-layers/imx-bsp/recipes-kernel)
- [Yocto Project Reference Manual: `BBFILES_DYNAMIC`](https://docs.yoctoproject.org/ref-manual/variables.html#term-BBFILES_DYNAMIC)
- [BitBake User Manual: `BBFILES_DYNAMIC`](https://docs.yoctoproject.org/bitbake/bitbake-user-manual/bitbake-user-manual-ref-variables.html#term-BBFILES_DYNAMIC) (including the `!` form)
