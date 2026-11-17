# frozen_string_literal: true

# CocoaPods + pnpm workspace symlink workaround.
#
# Upstream: https://github.com/CocoaPods/CocoaPods/issues/12798
# Symptom: `ArgumentError - pathname contains null byte` in
# `Pod::Project#group_for_path_in_group` → `base_path.realdirpath` while
# generating the Pods project (often intermittent on GHA macos runners).
#
# Fix: use `cleanpath` instead of `realdirpath` for the relative base so
# CocoaPods does not resolve pnpm's deep symlink tree during group layout.
# Loaded into the ephemeral Expo `ios/` tree by patch-ios-cocoapods-null-byte.mjs.

module CocoaPodsPathnameWorkaround
  def group_for_path_in_group(absolute_pathname, group, reflect_file_system_structure, base_path = nil)
    unless absolute_pathname.absolute?
      raise ArgumentError, "Paths must be absolute #{absolute_pathname}"
    end
    unless base_path.nil? || base_path.absolute?
      raise ArgumentError, "Paths must be absolute #{base_path}"
    end

    relative_base = base_path.nil? ? group.real_path : base_path.cleanpath
    relative_pathname = absolute_pathname.relative_path_from(relative_base)
    relative_dir = relative_pathname.dirname

    if reflect_file_system_structure
      path = relative_base
      relative_dir.each_filename do |name|
        break if name.to_s.downcase.include?('.lproj')
        next if name == '.'

        path += name
        group = group.children.find { |child| child.display_name == name } || group.new_group(name, path)
      end
      return group
    end

    group
  end
end

Pod::Project.prepend(CocoaPodsPathnameWorkaround)
