Rails.application.routes.draw do
  root 'welcome#index'
  get 'filelist' => 'posts#show'
  get 'download' => 'posts#download'
end
