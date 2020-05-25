# config valid only for current version of Capistrano
# lock '3.5.0'

set :application, 'upload_test_app_ror'
set :repo_url, 'git@github.com:randikabanura/upload_test_app_ror.git'
set :stages, ["production"]
# Default branch is :master
ask :branch, `git rev-parse --abbrev-ref HEAD`.chomp

#
set :pty, true

#set :linked_files, %w(config/database.yml config/secrets.yml config/keys/x509/samidp_private_epicbusiness.pem config/keys/x509/samidp_private_ceacopilot_org.pem)
#set :linked_dirs,  %w(bin tmp/pids tmp/cache tmp/sockets vendor/bundle public/system)
# set :linked_dirs, %w(bin log tmp)
# Default value for :linked_files is []
# set :linked_files, fetch(:linked_files, []).push('config/database.yml', 'config/secrets.yml')

# Default value for linked_dirs is []
# set :linked_dirs, fetch(:linked_dirs, []).push('log', 'tmp/pids', 'tmp/cache', 'tmp/sockets', 'public/system')

# Default value for default_env is {}
# set :default_env, { path: "/opt/ruby/bin:$PATH" }

# Default value for keep_releases is 5
# set :keep_releases, 5

namespace :deploy do
  task :restart do
    #run "touch #{current_path}/tmp/restart.txt"
    run "#{sudo} service nginx #{command}"
  end

  after :restart, :clear_cache do
    on roles(:web), in: :groups, limit: 3, wait: 10 do
      # Here we can do anything such as:
      # within release_path do
      #   execute :rake, 'cache:clear'
      # end
    end
  end
end
