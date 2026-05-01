# Dynamic navigation generator - builds nav from docs folder structure
# Folders become collapsible sections, files become links
# Auto-crawls docs root and groups loose files
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
      
      # Auto-detect root-level docs and group them
      root_docs = []

      # Get all docs folders
      folders = {}
      pages.each do |page|
        next unless page.path
        path = page.path

        # Skip special files and folders that match sections
        next if path.start_with?('_') || path.start_with?('lib/')
        next if path == 'CHANGELOG.md' || path == 'LICENSE' || path == 'README.md'

        # Get folder and filename
        folder = File.dirname(path)
        filename = File.basename(path, '.md')
        
        # Get title from frontmatter or filename
        title = page.data['title'] || filename.gsub('-', ' ').capitalize
        title = title.to_s
        
        # Skip index and hidden pages  
        next if page.data['nav'] == false
        next if filename == 'index.md'
        
        # Handle root-level docs - auto-group by filename
        if folder == '.' || folder == ''
          # Skip root docs that have matching section folders (they'd be duplicates)
          section_folders = section_titles.keys + ['community', 'legal', 'guides', 'reference', 'tutorials', 'getting-started']
          if section_folders.include?(filename)
            next  # Skip - user should use folder version
          end
          
          # Known groupings for root docs
          if ['examples', 'faq', 'contributing'].include?(filename)
            folder = 'community'
          elsif filename == 'legal'
            folder = 'legal'
          else
            # Other root docs go to "Docs" section
            root_docs << { 'title' => title, 'url' => page.url }
            next
          end
        end
        
        folder = '.' if folder == '.'

        if folder == '.'
          nav << { 'title' => title, 'url' => page.url }
        else
          # Use custom section title if defined, otherwise capitalize
          section_title = section_titles[folder] || folder.gsub('-', ' ').capitalize
          folders[folder] ||= { 'title' => section_title, 'items' => [] }
          folders[folder]['items'] << { 'title' => title, 'url' => page.url }
        end
      end

      # Sort folders by title
      folders.each { |k, v| v['items'].sort_by! { |i| i['title'] } }

      # Build result: root links first, then folders sorted by title
      result = nav + folders.values.sort_by { |f| f['title'] }
      
      # Add ungrouped root docs as "Docs" section at end
      if root_docs.any?
        result << { 'title' => 'Docs', 'items' => root_docs.sort_by { |i| i['title'] } }
      end
      
      result
    end
  end
end