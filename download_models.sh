#!/bin/bash
# This script downloads TensorFlow.js models from Google Cloud Storage.
# It reads a list of model links from text files and downloads them to a local directory structure.


echo "Downloading resnet50 models..."
linklist=$(cat resnet50.txt)
for link in $linklist
do  
    # get link and save to file with the same name and path
    mkdir -p storage.googleapis.com/tfjs-models/$(dirname $link)
    wget https://storage.googleapis.com/tfjs-models/$link -O storage.googleapis.com/tfjs-models/$link
done

echo "Downloading mobilenet models..."
linklist=$(cat mobilenet.txt)
for link in $linklist
do  
    # get link and save to file with the same name and path
    mkdir -p storage.googleapis.com/tfjs-models/$(dirname $link)
    wget https://storage.googleapis.com/tfjs-models/$link -O storage.googleapis.com/tfjs-models/$link
done
