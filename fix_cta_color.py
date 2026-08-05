import os

dir_path = "/home/ubuntu/inboxseguro/inboxseguro-landing-main"
files_to_update = ["dkim-checker.html", "spf-checker.html", "dmarc-checker.html", "domain-checker.html"]

for file in files_to_update:
    file_path = os.path.join(dir_path, file)
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Fix muddy purple background in CTA
    content = content.replace(
        'bg-gradient-to-br from-blue-900/40 to-indigo-900/30 border border-blue-500/30',
        'bg-blue-50 border border-blue-200'
    )
    
    # Fix the button text color on the primary button inside that CTA
    # From: bg-brand-600 hover:bg-brand-500 text-slate-900 font-bold
    # To: bg-brand-600 hover:bg-brand-500 text-white font-bold
    content = content.replace(
        'bg-brand-600 hover:bg-brand-500 text-slate-900 font-bold',
        'bg-brand-600 hover:bg-brand-500 text-white font-bold'
    )

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
        
    print(f"Fixed CTA in {file}")

print("Done.")
