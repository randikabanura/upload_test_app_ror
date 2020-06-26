class PostsController < ApplicationController
  require 'json'

  def show
    @records = Dir.entries("#{Rails.root}/uploads").reject { |f| File.directory?(f) || File.basename(f)=='processing' }.map{ |s| File.basename(s) }
    render json: @records.to_json
  end
  def download
    file_id = params[:file_id]
    send_file "#{Rails.root}/uploads/#{file_id}"
  end
end
