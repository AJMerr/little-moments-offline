package db

import "gorm.io/gorm"

func Migrate(gdb *gorm.DB) error {
	if err := gdb.AutoMigrate(
		&User{},
		&Photo{},
		&Album{},
		&AlbumPhoto{},
	); err != nil {
		return err
	}

	if err := gdb.SetupJoinTable(&Album{}, "Photos", &AlbumPhoto{}); err != nil {
		return err
	}
	if err := gdb.SetupJoinTable(&Photo{}, "Albums", &AlbumPhoto{}); err != nil {
		return err
	}

	return nil
}
