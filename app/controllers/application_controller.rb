class ApplicationController < ActionController::Base
  before_filter :maintainance_message_redirection

  def maintainance_message_redirection
  # unless allowed_ips.any? { |block| block.include?(request.remote_ip) }
  redirect_to '/404.html' unless cookies[:lfu_845TY8].present?
  # end
end
end
