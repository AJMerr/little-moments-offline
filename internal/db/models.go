package db

import (
	"time"
)

type User struct {
	ID        string    `gorm:"primaryKey;type:text"`
	Email     string    `gorm:"uniqueIndex;not null"`
	UserName  string    `gorm:"type:text"`
	CreatedAt time.Time `gorm:"not null"`
}
