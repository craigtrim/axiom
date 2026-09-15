# Supplemental runtime licence

The npm archive for @rubensworks/saxes 6.0.1 omits its licence file. This copy was retrieved from the upstream repository using the package registry's gitHead reference.

Source: https://raw.githubusercontent.com/rubensworks/saxes/0f36739ccb43a87c50408e1e713382cda09e0b05/LICENSE

SHA-256: 0fac2374380621b22e6b50451057721a9c52935b02d16d106a9f04897f061d0e

scripts/notices.mjs includes this text in the packaged third-party notices.

## SPARQL dependencies

Comunica 5.4.0 function packages omit some copies of their repository license. The supplemental file is from the gitHead recorded by those packages:

https://raw.githubusercontent.com/comunica/comunica/8a0a10913cb705adda45997210ebbe5502274a60/LICENSE.txt

The undici-types 5.26.5 archive omits its license. Its supplemental copy comes from:

https://raw.githubusercontent.com/nodejs/undici/v5.26.5/LICENSE

hash.js 1.1.7 and imurmurhash 0.1.4 publish full MIT notices in their README files. negotiate 1.0.1 embeds its BSD notice in negotiate.js. The generator includes those texts directly from the installed packages.

asyncjoin 1.2.5, sparqlalgebrajs 5.0.2 and tr46 0.0.3 declare MIT in their published package metadata but supply no separate license file. Their exact npm source revisions also contain none. The generator records that declaration and any provided author field, followed by the standard MIT permission and disclaimer text. It does not invent a copyright notice. The standard text is retained in MIT.txt from:

https://raw.githubusercontent.com/spdx/license-list-data/v3.26.0/text/MIT.txt

These supplements are restricted to the verified package versions. Upgrades require another notice review. Packaging still fails for an unknown missing license.
