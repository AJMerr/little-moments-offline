package db

import (
	"time"
)

type User struct {
	ID        string    `gorm:"primaryKey;type:text"`
	Email     string    `gorm:"uniqueIndex;not null"`
	UserName  string    `gorm:"type:text"`
	CreatedAt time.Time `gorm:"not null"`

	Photos []Photo `gorm:"foreignKey:OwnerID"`
}

type Photo struct {
	ID          string `gorm:"primaryKey;type:text"`
	OwnerID     string `gorm:"index;not null"`
	Title       string `gorm:"type:text;not null"`
	Description string `gorm:"type:text"`
	OriginKey   string `gorm:"not null;uniqueIndex"`
	ContentType string `gorm:"not null"`
	Bytes       int64  `gorm:"not null"`
	CreatedAt   time.Time

	Owner  User    `gorm:"constraint:OnDelete:CASCADE;foreignKey:OwnerID;references:ID"`
	Albums []Album `gorm:"many2many:album_photos"`
}

type Album struct {
	ID          string    `gorm:"primaryKey;type:text"`
	OwnerID     string    `gorm:"index;not null"`
	Title       string    `gorm:"type:text;not null"`
	Description string    `gorm:"type:text"`
	CreatedAt   time.Time `gorm:"index"`

	Owner  User    `gorm:"constraint:OnDelete:CASCADE;foreignKey:OwnerID;references:ID"`
	Photos []Photo `gorm:"many2many:album_photos"`
}

type AlbumPhoto struct {
	AlbumID string    `gorm:"primaryKey;type:text;index"`
	PhotoID string    `gorm:"primaryKey;type:text;index"`
	AddedAt time.Time `gorm:"not null;index"`
}
