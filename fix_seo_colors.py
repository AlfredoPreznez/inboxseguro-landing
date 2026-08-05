import os

dir_path = "/home/ubuntu/inboxseguro/inboxseguro-landing-main"
files_to_update = ["dkim-checker.html", "spf-checker.html", "dmarc-checker.html", "domain-checker.html"]

for file in files_to_update:
    file_path = os.path.join(dir_path, file)
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    parts = content.split('<!-- SSR/SEO Static Informative Content -->')
    if len(parts) == 2:
        top_part = parts[0]
        bottom_part = parts[1]
        
        # Fix leftover dark theme classes
        bottom_part = bottom_part.replace('bg-slate-900/80', 'bg-slate-50')
        bottom_part = bottom_part.replace('border-slate-800', 'border-slate-200')
        bottom_part = bottom_part.replace('bg-slate-900/40', 'bg-slate-50')
        bottom_part = bottom_part.replace('bg-slate-800', 'bg-slate-100')
        bottom_part = bottom_part.replace('bg-white/10', 'bg-slate-100')
        bottom_part = bottom_part.replace('bg-white/15', 'bg-slate-200')
        bottom_part = bottom_part.replace('border-white/20', 'border-slate-300')
        bottom_part = bottom_part.replace('text-blue-400', 'text-brand-600')
        
        content = top_part + '<!-- SSR/SEO Static Informative Content -->' + bottom_part

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
            
        print(f"Fixed {file}")

print("Done.")
