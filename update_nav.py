import os
import re

dir_path = "/home/ubuntu/inboxseguro/inboxseguro-landing-main"

# Read index.html to extract the nav
with open(os.path.join(dir_path, "index.html"), "r", encoding="utf-8") as f:
    index_content = f.read()

# Extract <nav>...</nav> using regex
nav_match = re.search(r'(<nav.*?</nav>)', index_content, re.DOTALL)
if not nav_match:
    print("Error: Could not find <nav> in index.html")
    exit(1)

new_nav = nav_match.group(1)

html_files = [f for f in os.listdir(dir_path) if f.endswith(".html") and f != "index.html"]
count = 0

for file in html_files:
    file_path = os.path.join(dir_path, file)
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Replace existing <nav> block
    if "<nav" in content and "</nav>" in content:
        new_content = re.sub(r'<nav.*?</nav>', new_nav, content, flags=re.DOTALL)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        count += 1
        print(f"Updated {file}")
    else:
        print(f"Skipping {file} - no <nav> found")

print(f"\nSuccessfully updated nav in {count} files.")
