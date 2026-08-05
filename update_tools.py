import os
import re

dir_path = "/home/ubuntu/inboxseguro/inboxseguro-landing-main"
files_to_update = ["dkim-checker.html", "spf-checker.html", "dmarc-checker.html", "domain-checker.html"]

for file in files_to_update:
    file_path = os.path.join(dir_path, file)
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Update <main> tag
    content = re.sub(
        r'<main class="flex-grow relative overflow-hidden pt-28 pb-16">',
        r'<main class="flex-grow flex flex-col bg-white">',
        content
    )

    # 2. Add dark section start
    content = content.replace(
        '<!-- Dynamic Background -->',
        '<section class="relative pt-28 pb-16 overflow-hidden bg-slate-900 shrink-0">\n        <!-- Dynamic Background -->'
    )

    # 3. Add section break before SEO content
    # The SEO content is marked by <!-- SSR/SEO Static Informative Content -->
    # It is preceded by the tool's container div.
    seo_marker = r'<!-- SSR/SEO Static Informative Content -->'
    
    # We replace the SEO marker and the div after it.
    # We also close the previous max-w-3xl container and the dark section.
    section_break = '''        </div> <!-- close max-w-3xl -->
        </section> <!-- close dark section -->

        <section class="py-16 bg-white border-t border-slate-100 flex-grow">
            <div class="max-w-3xl w-full mx-auto px-4 text-left space-y-8">
                <!-- SSR/SEO Static Informative Content -->
                <div class="space-y-8">'''
                
    content = re.sub(
        r'<!-- SSR/SEO Static Informative Content -->\s*<div class="text-left bg-slate-900/60 rounded-2xl border border-slate-800 p-6 md:p-8 space-y-8">',
        section_break,
        content
    )

    # 4. Change text colors in the SEO section
    # Since the SEO section is the rest of the file until </main>, we can split the file
    parts = content.split('<!-- SSR/SEO Static Informative Content -->')
    if len(parts) == 2:
        top_part = parts[0]
        bottom_part = parts[1]
        
        # In bottom_part, replace text-white with text-slate-900
        bottom_part = bottom_part.replace('text-white', 'text-slate-900')
        # In bottom_part, replace text-slate-400 with text-slate-600
        bottom_part = bottom_part.replace('text-slate-400', 'text-slate-600')
        bottom_part = bottom_part.replace('text-slate-300', 'text-slate-600')
        bottom_part = bottom_part.replace('bg-white/5', 'bg-slate-50')
        bottom_part = bottom_part.replace('border-white/5', 'border-slate-200')
        bottom_part = bottom_part.replace('text-blue-300', 'text-blue-600')
        
        # We also need to fix the closing tags at the very end of <main>
        # Currently, there's a </div> closing the max-w-3xl container, and then </main>.
        # We added a <section> so we need to close it.
        # But wait, our section_break opened <section> and <div> and <div class="space-y-8">.
        # The original code only had <div class="text-left ...">.
        # So we have ONE extra open div.
        bottom_part = bottom_part.replace('</main>', '</div>\n            </section>\n    </main>')
        
        content = top_part + '<!-- SSR/SEO Static Informative Content -->' + bottom_part

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    
    print(f"Updated {file}")

print("Done.")
