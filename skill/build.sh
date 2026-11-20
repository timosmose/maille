#!/bin/sh
# Rebuild the downloadable skill after changing maille.js or the skill.
#   sh skill/build.sh   (from the repo root)
set -e
cp maille.js skill/maille-motion/assets/maille.js
rm -f maille-skill.zip
(cd skill && zip -rq ../maille-skill.zip maille-motion -x '*.DS_Store')
echo "maille-skill.zip $(wc -c < maille-skill.zip) bytes"
