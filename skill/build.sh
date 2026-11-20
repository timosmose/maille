#!/bin/sh
# Rebuild the downloadable skill and the live demo after changing maille.js or the skill.
#   sh skill/build.sh   (from the repo root)
set -e
cp maille.js skill/maille-motion/assets/maille.js
rm -f maille-skill.zip
(cd skill && zip -rq ../maille-skill.zip maille-motion -x '*.DS_Store')
# film.html: the template, served from the site root, playing the starter film on skill.html
sed "s|https://maille-pi.vercel.app/img/meadow.jpg|img/meadow.jpg|" skill/maille-motion/templates/film.html > film.html
echo "maille-skill.zip $(wc -c < maille-skill.zip) bytes, film.html updated"
