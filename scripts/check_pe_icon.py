import os
import pefile

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
exe_path = os.path.join(base_dir, "dist", "Antigravity_History_Manager.exe")
pe = pefile.PE(exe_path)

for entry in pe.DIRECTORY_ENTRY_RESOURCE.entries:
    name = pefile.RESOURCE_TYPE.get(entry.id, str(entry.id))
    print(f"Resource Type: {name} ({entry.id})")
    if hasattr(entry, 'directory'):
        for sub in entry.directory.entries:
            print(f"   Entry ID: {sub.id}")
            if hasattr(sub, 'directory'):
                for lang in sub.directory.entries:
                    data = pe.get_data(lang.data.struct.OffsetToData, lang.data.struct.Size)
                    print(f"      Lang {lang.id}: data size {len(data)} bytes")
