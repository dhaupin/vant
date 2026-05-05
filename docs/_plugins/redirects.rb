# Redirect .html URLs to clean URLs
Jekyll::Hooks.register :pages, :post_render do |page, payload|
  # This runs after build - redirects handled via .htaccess or server config
end
