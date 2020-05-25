class WelcomeController < ApplicationController
  before_action :set_post, only: [:show, :edit, :update, :destroy]
  def index
  end
end
