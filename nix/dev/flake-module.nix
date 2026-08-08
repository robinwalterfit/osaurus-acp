# SPDX-FileCopyrightText: 2026 Robin Walter <hello@robinwalter.me>
# SPDX-License-Identifier: Apache-2.0
#
# Copyright Copyright 2026 Robin Walter <hello@robinwalter.me>
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
{
  config,
  inputs,
  self,
  ...
}:
let
  inherit (inputs)
    devenv
    nix-modules
    nixpkgs
    treefmt-nix
    ;
in
{
  # https://github.com/NixOS/nixpkgs/blob/master/lib/systems/flake-systems.nix
  systems = nixpkgs.lib.systems.flakeExposed;

  imports = [
    devenv.flakeModule
    treefmt-nix.flakeModule
    nix-modules.flakeModules.treefmt
  ];

  perSystem =
    {
      config,
      pkgs,
      treefmtConfigFiles,
      ...
    }:
    {
      # Project's devenv shell definitions
      devenv.shells = {
        default = {
          name = "${self.lib.projectName}-${self.lib.shortRev}";

          imports = [
            nix-modules.devenvModules.git-hooks
            nix-modules.devenvModules.shell-base
          ];

          enterShell = ''
            ln --force --symbolic '${treefmtConfigFiles.biome}' './biome.json'
            ln --force --symbolic '${treefmtConfigFiles.taplo}' './.taplo.toml'
            ln --force --symbolic '${treefmtConfigFiles.yamllint}' './.yamllint'
          '';

          # Use treefmt wrapper with our configuration and tools in git-hooks
          git-hooks.hooks.treefmt.package = config.treefmt.build.wrapper;

          languages = {
            # Enable Shell development
            shell.enable = true;
            shell.lsp.enable = true;
          };

          # Install additional packages
          packages =
            with pkgs;
            [
              bun

              # Add GitHub CLI
              gh

              # Add treefmt
              config.treefmt.build.wrapper
            ]
            ++ builtins.attrValues config.treefmt.build.programs;

          # Declare default options of the projects own development shells
          robinwalterfit = {
            nix-modules = {
              devenv.zed = {
                enable = true;
                extraConfig = {
                  languages = {
                    JavaScript = {
                      ensure_final_newline_on_save = true;
                      format_on_save = "on";
                      formatter = [
                        { code_action = "source.fixAll.biome"; }
                        { code_action = "source.organizeImports.biome"; }
                        {
                          language_server = {
                            name = "biome";
                          };
                        }
                      ];
                      hard_tabs = false;
                      language_servers = [
                        "biome"
                        "!vtsls"
                        "..."
                      ];
                      preferred_line_length = 120;
                      remove_trailing_whitespace_on_save = true;
                      tab_size = 2;
                    };
                    JSON = {
                      format_on_save = "on";
                      formatter = [
                        { code_action = "source.fixAll.biome"; }
                        {
                          language_server = {
                            name = "biome";
                          };
                        }
                      ];
                      language_servers = [
                        "biome"
                        "..."
                      ];
                      tab_size = 2;
                    };
                    JSONC = {
                      format_on_save = "on";
                      formatter = [
                        { code_action = "source.fixAll.biome"; }
                        {
                          language_server = {
                            name = "biome";
                          };
                        }
                      ];
                      language_servers = [
                        "biome"
                        "..."
                      ];
                      tab_size = 2;
                    };
                    TOML = {
                      formatter = "language_server";
                      tab_size = 2;
                    };
                    TypeScript = {
                      ensure_final_newline_on_save = true;
                      format_on_save = "on";
                      formatter = [
                        { code_action = "source.fixAll.biome"; }
                        { code_action = "source.organizeImports.biome"; }
                        {
                          language_server = {
                            name = "biome";
                          };
                        }
                      ];
                      hard_tabs = false;
                      language_servers = [
                        "biome"
                        "!vtsls"
                        "..."
                      ];
                      preferred_line_length = 120;
                      remove_trailing_whitespace_on_save = true;
                      tab_size = 2;
                    };
                    TSX = {
                      ensure_final_newline_on_save = true;
                      format_on_save = "on";
                      formatter = [
                        { code_action = "source.fixAll.biome"; }
                        { code_action = "source.organizeImports.biome"; }
                        {
                          language_server = {
                            name = "biome";
                          };
                        }
                      ];
                      hard_tabs = false;
                      language_servers = [
                        "biome"
                        "!vtsls"
                        "..."
                      ];
                      preferred_line_length = 120;
                      remove_trailing_whitespace_on_save = true;
                      tab_size = 2;
                    };
                    YAML = {
                      formatter = "language_server";
                      tab_size = 2;
                    };
                  };
                  lsp = {
                    biome = {
                      binary = {
                        arguments = [ "lsp-proxy" ];
                        path = "${pkgs.biome}/bin/biome";
                      };
                      settings = {
                        require_config_file = true;
                      };
                    };
                  };
                };
              };

              useRustReimplementations = true;
            };
          };
        };
      };

      # Project's treefmt configuration
      treefmt = {
        programs = {
          biome.enable = true;

          taplo = {
            enable = true;

            settings = {
              include = [ "**/REUSE.toml" ];
            };
          };

          yamllint.enable = true;
        };

        settings.formatter = {
          nufmt.enable = true;
        };
      };
    };

  flake = {
    # For repl exploration / debug
    config.config = config;
  };
}
