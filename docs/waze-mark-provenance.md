# Waze mark provenance

`assets/waze-mark.svg` is the unmodified Waze mascot SVG embedded in the header of the official [Waze press center](https://www.waze.com/press), retrieved on 2026-10-10. It retains the original `0 0 108 100` viewBox, white body, black outline, face and wheels. Only a trailing newline was added when saving the standalone file.

- SHA-256: `817b77a1d7df3aa57776c18e8f3ba8ee20a298e5ed884395c8c3638b12916c7f`
- Used solely to identify the existing user-initiated Waze directions link, beside its visible localized label.
- Served locally, with no third-party image request, script or tracking.
- Decorative `alt=""` and `aria-hidden="true"` preserve the action's accessible name.
- The original colors and proportions remain intact in both themes. A white image-only backing preserves contrast in forced-colors mode; the button itself keeps the user's system colors.

## Brand and rights guidance

Waze is a third-party trademark. The official source does not provide a separate permissive software license for this mark; this file is not represented as MIT/Apache-licensed or as granting trademark rights. No partnership or endorsement is claimed.

The [Waze Transport SDK branding guidance](https://developers.google.com/waze/intro-transport#color_treatment_and_considerations) illustrates use on colored backgrounds and says not to invert the logo. That guidance is for the SDK and is not treated here as a general trademark license. The [Deep Links documentation](https://developers.google.com/waze/deeplinks) documents the existing link integration. The press center directs marketing uses and asset approval requests to the [official brand request form](https://support.google.com/waze/contact/waze_brand_requests). No request has been submitted on the site's behalf.

Public release remains subject to the site owner's review and approval, including any applicable brand permissions. This change does not change the destination policy, route URL, labels, backend or purchase behavior.
