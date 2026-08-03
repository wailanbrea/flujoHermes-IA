import subprocess

print("=== CHECKING GPU CONTROLLERS ===")
cmd = 'powershell -Command "Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion"'
res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
print(res.stdout)
