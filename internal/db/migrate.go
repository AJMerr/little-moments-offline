package db

import "gorm.io/gorm"

func Migrate(gdb *gorm.DB) error {
	return gdb.AutoMigrate(
		&User{},
	)
}
