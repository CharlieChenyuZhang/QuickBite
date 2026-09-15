# UI component sources

These six components were installed from the official shadcn/ui registry with
shadcn CLI 4.21.0, using the project's `new-york` configuration and Tailwind CSS 4:

```sh
npx --yes shadcn@4.21.0 add button input dialog skeleton badge separator --yes --overwrite
```

The installation command ran against this repository and replaced the previous
handwritten implementations. The resulting local source is maintained by
QuickBite, following shadcn/ui's source distribution model. The official registry
installed `radix-ui` and `cn`; these components now use those imports directly.
`Button`, `Input`, `Dialog`, and `Skeleton` are used in application screens.
`Badge` and `Separator` are available primitives without current screen usage.

[provenance.json](./provenance.json) records the CLI version, exact registry URLs,
and SHA-256 hashes of the registry responses and pristine CLI-generated files,
before local customization. Registry URLs can change over time; the hashes identify
the content used for this installation. The upstream MIT license is preserved in
[LICENSE.shadcn](./LICENSE.shadcn).

QuickBite customizations preserve the existing public component APIs, including
`ButtonProps`, `Button`'s default `type="button"`, `asChild`, and `DialogContent`'s
`showCloseButton`. They also retain the app's green theme and rounded corners,
use 44px or larger button/input controls and the dialog close control, provide
opaque 2px focus rings, bound dialogs to the viewport with scrolling, and give
the close control its existing accessible name, “Close dialog”. Dialog entry/exit
animation classes are omitted to preserve the current motion behavior without an
additional animation stylesheet. Skeletons are decorative and respect reduced
motion. `Separator` now uses the official Radix primitive for its semantics.

For future additions, run `npm run ui:add -- <component>`. Preview an update with
`npm run ui:add -- <component> --diff` before overwriting customized source.
Installing through the CLI adds source files, so there is no `shadcn/ui` runtime
package to import into screens.

Official references:

- [shadcn CLI](https://ui.shadcn.com/docs/cli)
- [Project configuration](https://ui.shadcn.com/docs/components-json)
- [Radix Button](https://ui.shadcn.com/docs/components/radix/button)
- [Radix Dialog](https://ui.shadcn.com/docs/components/radix/dialog)
