# Third-Party Software Notices and Licenses

This project distributes or bundles third-party software components under their respective open-source licenses.

---

## 1. antigravity-history (aghistory)

- **Upstream Repository:** [https://github.com/neo1027144-creator/antigravity-history](https://github.com/neo1027144-creator/antigravity-history)
- **Author:** Neo <neo1027144@gmail.com>
- **Version:** 0.2.6
- **License:** Apache License, Version 2.0

### Modifications Made in this Distribution
Pursuant to Section 4(b) of the Apache License 2.0, the following modifications were made to the original `antigravity-history` codebase:
1. **`discovery.py`**: Added `find_all_endpoints()` to detect and enumerate multiple running Google Antigravity language server processes across separate IDE workspace windows, extracting CSRF tokens and resolving active netstat/lsof listening ports dynamically.
2. **`cli.py`**: Updated trajectory listing and export aggregation logic to merge multi-instance conversation lists and export queues across all detected active workspaces.

Corresponding unified diff patches are provided in the [`patches/`](./patches/) directory:
- [`patches/01_discovery_multi_endpoint.patch`](./patches/01_discovery_multi_endpoint.patch)
- [`patches/02_cli_multi_workspace.patch`](./patches/02_cli_multi_workspace.patch)

### Apache License 2.0 Text

```text
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work.

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      patent license to make, have made, use, offer to sell, sell, import,
      and otherwise transfer the Work.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the conditions set forth in the Apache License 2.0.

   5. Disclaimer of Warranty. The Work is provided on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied.

   6. Limitation of Liability. In no event shall any Contributor be
      liable to You for damages arising out of the use or inability to use
      the Work.
```

---

## 2. Open-Source Fonts

- **Unbounded Font Family:** Designed by NaN, Luke Prowse, Ilya Naumoff. Licensed under the [SIL Open Font License, Version 1.1](http://scripts.sil.org/OFL).
- **Manrope Font Family:** Designed by Mikhail Sharanda. Licensed under the [SIL Open Font License, Version 1.1](http://scripts.sil.org/OFL).
- **JetBrains Mono Font Family:** Designed by Philipp Nurullin, Konstantin Bulenkov, JetBrains. Licensed under the [SIL Open Font License, Version 1.1](http://scripts.sil.org/OFL).
