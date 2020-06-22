class PostsController < ApplicationController
  require 'json'

  def show
    @records = Dir.glob("#{Rails.root}/uploads/**/*").map{ |s| File.basename(s) }
    render json: @records.to_json
  end
  def download
    file_id = params[:file_id]
    send_file "#{Rails.root}/uploads/#{file_id}"
  end
end
