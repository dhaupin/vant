# Dynamic navigation generator - builds nav from docs folder structure
# Folders become collapsible sections, MD files become links
require 'fileutils'

module Jekyll
  class NavGenerator < Generator
    safe true

    def generate(site)
      @site = site
      nav_data = build_nav(site.pages, site.config)
      site.config['nav'] = nav_data
    end

    def build_nav(pages, config)
      section_titles = config['nav_sections'] || {}
      section_order = config['nav_order'] || {}
      root_docs = []
      folders = {}

      pages.each do |page|
        next unless page.path
        path = page.path

        # Skip special folders/files
        next if path.start_with?('_') || path.start_with?('lib/')
        next if path == 'CHANGELOG.md' || path == 'LICENSE' || path == 'README.md'

        folder = File.dirname(path)
        filename = File.basename(path, '.md')
        
        # Skip index and hidden pages  
        next if page.data['nav'] == false
        next if filename == 'index.md'
        
        # Title from frontmatter or filename
        title = page.data['title'] || filename.gsub('-', ' ').capitalize
        title = title.to_s
        
        if folder == '.' || folder == ''
          # Root-level doc - add to root list
          root_docs << { 'title' => title, 'url' => page.url }
        else
          # Folder name = section, file = link
          section_title = section_titles[folder] || folder.gsub('-', ' ').capitalize
          folders[folder] ||= { 'title' => section_title, 'items' => [] }
          folders[folder]['items'] << { 'title' => title, 'url' => page.url }
        end
      end

      # Sort: items by title, folders by nav_order
      folders.each { |k, v| v['items'].sort_by! { |i| i['title'] } }

      # Build result: root docs first, then folders by nav_order
      result = []
      
      # Add root docs as "Docs" section
      if root_docs.any?
        result << { 'title' => 'Docs', 'items' => root_docs.sort_by { |i| i['title'] } }
      end
      
      # Add folders sorted by nav_order (find folder key from title)
      result += folders.values.sort_by do |f|
        title = f['title']
        # Find folder name with this title
        folder_key = section_titles.key(title) || title.downcase
        section_order[folder_key] || 999
      end
      
      result
    end
  end
end