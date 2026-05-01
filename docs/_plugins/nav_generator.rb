# Dynamic navigation generator - builds nav from docs folder structure
# Folders become collapsible sections, files become links
# Supports custom section titles from nav_sections config
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
      nav = []
      docs_dir = config['source'] || 'docs'
      section_titles = config['nav_sections'] || {}
      
      # Map root-level files to sections
      root_section_map = {
        'examples.md' => 'community',
        'faq.md' => 'community', 
        'contributing.md' => 'community',
        'legal.md' => 'legal'
      }

      # Get all docs folders
      folders = {}
      pages.each do |page|
        next unless page.path
        path = page.path

        # Skip special files
        next if path.start_with?('_') || path.start_with?('lib/')

        # Get folder
        folder = File.dirname(path)
        filename = File.basename(path, '.md')
        
        # Map root-level docs to sections
        if folder == '.'
          mapped = root_section_map[filename + '.md']
          folder = mapped if mapped
        end
        
        folder = '.' if folder == '.'

        # Get title from frontmatter or filename
        title = page.data['title'] || filename.gsub('-', ' ').capitalize
        title = title.to_s

        # Skip index and hidden pages
        next if page.data['nav'] == false
        next if filename == 'index.md'

        if folder == '.'
          nav << { 'title' => title, 'url' => page.url }
        else
          # Use custom section title if defined, otherwise capitalize folder name
          section_title = section_titles[folder] || folder.gsub('-', ' ').capitalize
          folders[folder] ||= { 'title' => section_title, 'items' => [] }
          folders[folder]['items'] << { 'title' => title, 'url' => page.url }
        end
      end

      # Sort folders
      folders.each { |k, v| v['items'].sort_by! { |i| i['title'] } }

      # Merge root items and folders - ensure section order
      nav + folders.values.sort_by { |f| f['title'] }
    end
  end
end