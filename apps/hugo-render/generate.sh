#!/bin/bash

cd /site

if [[ ! -z $THEME_ID ]]
then
  if [[ -d /themes/$THEME_ID ]]
  then
    [[ -d themes ]] || mkdir themes
    echo "Linking theme $THEME_ID to /themes/$THEME_ID"
    ln -sf /themes/$THEME_ID themes/$THEME_ID
  else
    echo "Using theme $THEME_URL $THEME_SUBPATH"
    git clone $THEME_URL themes/$THEME_ID
  fi

  if [[ ! -z "$THEME_SUBPATH" ]]
  then
      mv themes/$THEME_ID/$THEME_SUBPATH/* themes/$THEME_ID
  fi
fi

if [[ -d /site/resources/_gen ]]
then
    rm -rf /site/resources/_gen
fi

if [[ -f generate-wikigdrive.sh ]]
then
  ./generate-wikigdrive.sh
else
  cat /site/tmp_dir/config.toml
  hugo --config=/site/tmp_dir/config.toml --verbose
fi

CODE=$?

rm -rf .hugo_build.lock

exit $CODE
