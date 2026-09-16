#!/bin/bash
echo "Rollback..."

sleep 3

echo "Rollback Succesfully"

mkdir -p rollback

cd ./rollback

echo "rolled back to v3" > rollback.txt 

cd ../
