import os
import subprocess

print("Locating nvidia-smi.exe...")
for root, dirs, files in os.walk(r"C:\Windows\System32\DriverStore\FileRepository"):
    if "nvidia-smi.exe" in files:
        full_path = os.path.join(root, "nvidia-smi.exe")
        print(f"Found nvidia-smi: {full_path}")
        res = subprocess.run([full_path], capture_output=True, text=True)
        print(res.stdout)
        break
