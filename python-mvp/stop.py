# -*- coding: utf-8 -*-
# Manuelle Bedienung
import RPi.GPIO as GPIO
import time
import argparse

print("Stoppe beide Ausgänge")

GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)
GPIO.setup(26,GPIO.OUT)
GPIO.output(26,GPIO.HIGH)
GPIO.setup(13,GPIO.OUT)
GPIO.output(13,GPIO.HIGH)




