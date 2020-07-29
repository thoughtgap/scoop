# -*- coding: utf-8 -*-
# Manuelle Bedienung
# via
# Fahre 5 Sekunden hoch (h für hoch, r für runter)
# python m.py -r h -d 5
import RPi.GPIO as GPIO
import time
import argparse

parser = argparse.ArgumentParser(description='Klappenparameter')
parser.add_argument("--r")
parser.add_argument("--d", default=1, type=float, help="Die Dauer die der Motor fährt")

args = parser.parse_args()
r = args.r
print(r)

if r == "hoch" or r == "h":
  print("Fahre hoch")
  port = 26
elif r == "runter" or r == "r":
  print("Fahre runter")
  port = 13
else:
  print("Keine Richtung angegeben - aufhören")
  exit();

dauer = args.d
# dauer = 6
motorlaufen = dauer

vorherwarten = 1

print("Initialisiere")

GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)
GPIO.setup(port,GPIO.OUT)
GPIO.output(port,GPIO.HIGH)

print("Bevor es los geht warte ich "+ str(vorherwarten) + " Sekunden.")
time.sleep(vorherwarten)

print "LED off"
print("Lasse den Motor jetzt fuer " + str(motorlaufen) +" Sekunden laufen")
GPIO.output(port,GPIO.LOW)
time.sleep(motorlaufen)
GPIO.output(port,GPIO.HIGH)
print("Fertig")
