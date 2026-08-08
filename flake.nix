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
  description = "Osaurus ACP";

  inputs = {
    bun2nix = {
      inputs.nixpkgs.follows = "nixpkgs";
      url = "github:baileyluTCD/bun2nix";
    };
    flake-parts.url = "github:hercules-ci/flake-parts";
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
  };

  outputs =
    inputs@{ flake-parts, ... }:
    # See: https://flake.parts/getting-started.html
    flake-parts.lib.mkFlake { inherit inputs; } (
      { self, ... }:
      let
        inherit (inputs) bun2nix nixpkgs;

        lib = import ./nix/lib/defaults.nix { inherit self; };
      in
      {
        # https://github.com/NixOS/nixpkgs/blob/master/lib/systems/flake-systems.nix
        systems = nixpkgs.lib.systems.flakeExposed;

        imports = [
          # Activate partitions
          flake-parts.flakeModules.partitions

          ./nix/packages.nix
        ];

        partitionedAttrs = {
          checks = "dev";
          devShells = "dev";
          formatter = "dev";
        };
        partitions = {
          dev = {
            extraInputsFlake = ./nix/dev;
            module = _: { imports = [ ./nix/dev/flake-module.nix ]; };
          };
        };

        perSystem = { system, ... }: {
          _module.args.pkgs = import nixpkgs {
            inherit system;
            overlays = [ bun2nix.overlays.default ];
          };
        };

        flake = { inherit lib; };
      }
    );
}
