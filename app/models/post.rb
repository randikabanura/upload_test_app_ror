class Post < ApplicationRecord
  has_one_attached :image
  
  validates_presence_of :title, :description
end
