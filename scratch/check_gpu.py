import subprocess
import json
import os

print("=== CHECKING RUNNING PROCESSES ===")
try:
    cmd = 'powershell -Command "Get-Process | Where-Object {$_.WorkingSet -gt 300000000} | Select-Object Id, ProcessName, WorkingSet"'
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    print(res.stdout)
except Exception as e:
    print("Error:", e)

print("=== CHECKING NVIDIA GPU PROCESSES ===")
nvsmi_paths = [
    r"C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe",
    r"C:\Windows\System32\nvidia-smi.exe"
]

found = False
for path in nvsmi_paths:
    if os.path.exists(path):
        found = True
        print(f"Found nvidia-smi at {path}")
        res = subprocess.run([path], capture_output=True, text=True)
        print(res.stdout)
        break

if not found:
    print("Searching for nvidia-smi.exe in C:\\Windows\\System32\\DriverStore...")
    try:
        cmd = 'dir /s /b "C:\\Windows\\System32\\DriverStore\\nvidia-smi.exe"'
        res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        paths = res.stdout.strip().splitlines()
        if paths:
            print(f"Found nvidia-smi at {paths[0]}")
            res2 = subprocess.run([paths[0]], capture_output=True, text=True)
            print(res2.stdout)
    except Exception as e:
        print("Error finding nvidia-smi:", e)
