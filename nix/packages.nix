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
{ inputs, ... }: {
  perSystem =
    { system, ... }:
    let
      bun2nix = inputs.bun2nix.packages.${system}.default;

      osaurus-acp = bun2nix.mkDerivation {
        packageJson = ../package.json;

        src = ../.;

        bunDeps = bun2nix.fetchBunDeps { bunNix = ./modules/bun.nix; };
      };
    in
    {
      packages = {
        default = osaurus-acp;
      };
    };
}
