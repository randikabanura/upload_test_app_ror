# frozen_string_literal: true

FiLargefileupload.configure do |config|
  # config.files_folder = 'uploads'

  # This value represents the default chunk size
  # It is defined as megabytes 1 mb = 1024 kb
  # Default is 10 mb which is 10240 kb

  config.default_chunk_size = 3
end
