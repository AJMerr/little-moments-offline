package db

import (
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func SeedLocalUser(gdb *gorm.DB) error {
	u := User{ID: "local_user", Email: "local@example.com", UserName: "LocalUser"}
	// safe if exists already
	return gdb.Clauses(clause.OnConflict{DoNothing: true}).Create(&u).Error
}
