#!/bin/bash
# A sample Bash script, by Ryan
touch timing.txt

echo "Metrics for Dark Forest\n" > timing.txt

echo "Localhost\n" >> timing.txt

yarn hardhat --network localhost metrics:pause_unpause 0x500cf53555c09948f4345594F9523E7B444cD67E >> timing.txt

echo "\nLocal Optimism\n" >> timing.txt

yarn hardhat --network optimism metrics:pause_unpause 0x59c7D03d2E9893FB7bAa89dA50a9452e1e9B8b90 >> timing.txt

echo "\nxDai\n" >> timing.txt

yarn hardhat --network xdai metrics:pause_unpause 0x688c78df6b8b64be16a7702df10ad64100079a68 >> timing.txt

echo "\nGnosis Optimisim" >> timing.txt

yarn hardhat --network gnosis_optimism metrics:pause_unpause 0x16d136627E2C3D930d3ae492816e09a359953f9a >> timing.txt

