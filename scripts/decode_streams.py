import zlib, re

with open('.aistudio/artifacts/brain/39adf947-91f1-4408-94dc-1b8f7d5e294f/.tempmediaStorage/media_1792396968675_09d2752c.pdf', 'rb') as f:
    data = f.read()

def get_obj(oid):
    target = f'\n{oid} 0 obj'.encode()
    idx = data.find(target)
    if idx == -1:
        target = f'\r{oid} 0 obj'.encode()
        idx = data.find(target)
        if idx == -1:
            target = f'{oid} 0 obj'.encode()
            idx = data.find(target)
            if idx == -1: return None
    end = data.find(b'endobj', idx)
    return data[idx:end]

font_cmaps = {}
for font_id in [18, 22, 12, 363, 7, 5, 350, 64, 334, 374, 379, 14]:
    fobj = get_obj(font_id)
    if not fobj: continue
    tounicode_m = re.search(rb'/ToUnicode\s+(\d+)\s+0\s+R', fobj)
    if tounicode_m:
        cid = int(tounicode_m.group(1))
        cobj = get_obj(cid)
        sm = re.search(rb'stream\r?\n([\s\S]*?)\r?\nendstream', cobj)
        if sm:
            cmap_data = zlib.decompress(sm.group(1)).decode('latin1', errors='ignore')
            cmap = {}
            for bf in re.finditer(r'<([0-9a-fA-F]+)>\s+<([0-9a-fA-F]+)>', cmap_data):
                src = int(bf.group(1), 16)
                dst_hex = bf.group(2)
                try:
                    dst = bytes.fromhex(dst_hex).decode('utf-16be')
                except:
                    dst = '?'
                cmap[src] = dst
            for bfrange in re.finditer(r'<([0-9a-fA-F]+)>\s+<([0-9a-fA-F]+)>\s+<([0-9a-fA-F]+)>', cmap_data):
                start = int(bfrange.group(1), 16)
                end = int(bfrange.group(2), 16)
                dst_start_hex = bfrange.group(3)
                dst_start = int(dst_start_hex, 16)
                for code in range(start, end + 1):
                    val = dst_start + (code - start)
                    h = f'{val:04x}' if val <= 0xffff else f'{val:08x}'
                    try:
                        dst = bytes.fromhex(h).decode('utf-16be')
                    except:
                        dst = '?'
                    cmap[code] = dst
            font_cmaps[font_id] = cmap

print(f'CMaps built for {len(font_cmaps)} fonts!')

def decode_stream(stream_file, font_map):
    with open(stream_file, 'rb') as f:
        st_text = f.read().decode('latin1', errors='ignore')
    lines = st_text.splitlines()
    cur_font = None
    decoded_lines = []
    for l in lines:
        f_match = re.search(r'(/F\d+)\s+[\d.]+\s+Tf', l)
        if f_match:
            cur_font = font_map.get(f_match.group(1))
        array_match = re.search(r'\[([\s\S]*?)\]\s*TJ', l)
        if array_match:
            parts = re.findall(r'<([0-9a-fA-F]+)>|\((.*?)\)', array_match.group(1))
            text_frag = ''
            for hex_code, lit in parts:
                if hex_code:
                    step = 4 if len(hex_code) % 4 == 0 else 2
                    for i in range(0, len(hex_code), step):
                        c = int(hex_code[i:i+step], 16)
                        ch = font_cmaps.get(cur_font, {}).get(c, f'[{c:x}]')
                        text_frag += ch
                elif lit:
                    text_frag += lit
            if text_frag.strip():
                decoded_lines.append(text_frag)
        else:
            tj_match = re.search(r'<([0-9a-fA-F]+)>\s*Tj', l)
            if tj_match:
                hex_code = tj_match.group(1)
                step = 4 if len(hex_code) % 4 == 0 else 2
                text_frag = ''
                for i in range(0, len(hex_code), step):
                    c = int(hex_code[i:i+step], 16)
                    ch = font_cmaps.get(cur_font, {}).get(c, f'[{c:x}]')
                    text_frag += ch
                if text_frag.strip():
                    decoded_lines.append(text_frag)
    return decoded_lines

font_map_84 = {'/F5': 18, '/F6': 22, '/F3': 12, '/F15': 363, '/F2': 7, '/F1': 5, '/F13': 350, '/F7': 64, '/F10': 334}
res_84 = decode_stream('stream_410.txt', font_map_84)
print('=== STREAM 410 (Page 84) ===')
for line in res_84:
    print(line)

font_map_86 = {'/F5': 18, '/F2': 7, '/F1': 5, '/F13': 350, '/F16': 374, '/F17': 379, '/F4': 14}
res_86 = decode_stream('stream_411.txt', font_map_86)
print('\n=== STREAM 411 (Page 85) ===')
for line in res_86:
    print(line)
