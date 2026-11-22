import os, sys, zipfile
# 프로젝트 폴더를 zip 으로 (zip -qr 과 같은 구조: 맨 위에 "Pokémon - KeiKan/")
#   python3 mkzip.py <폴더가 들어 있는 곳> <만들 zip>
base, out = sys.argv[1], sys.argv[2]
tmp = out + ".tmp"
with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
    root = os.path.join(base, "Pokémon - KeiKan")
    for d, _, fs in sorted(os.walk(root)):
        for f in sorted(fs):
            p = os.path.join(d, f)
            z.write(p, os.path.relpath(p, base))
os.replace(tmp, out)
print("zip", out, os.path.getsize(out))
