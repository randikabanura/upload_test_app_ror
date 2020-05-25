Rails.application.routes.draw do
  resources :posts

  root 'posts#index'
  namespace 'v1', defaults: { format: :json } do
    get '/upload/init' => 'large_file_upload#initialize_upload'
    post '/upload' => 'large_file_upload#upload'
    get '/upload/status' => 'large_file_upload#upload_status'
  end
end
