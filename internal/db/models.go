package db

import (
	"time"

	"gorm.io/gorm"
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
	DeletedAt   gorm.DeletedAt

	Owner  User    `gorm:"constraint:OnDelete:CASCADE;foreignKey:OwnerID;references:ID"`
	Albums []Album `gorm:"many2many:album_photos"`
}

type Album struct {
	ID           string    `gorm:"primaryKey;type:text"`
	OwnerID      string    `gorm:"index;not null"`
	Title        string    `gorm:"type:text;not null"`
	Description  string    `gorm:"type:text"`
	CoverPhotoID *string   `gorm:"index"`
	CreatedAt    time.Time `gorm:"index"`
	UpdatedAt    time.Time
	DeletedAt    gorm.DeletedAt

	// TODO: Re-enable this when I have Auth
	// Owner  User    `gorm:"constraint:OnDelete:CASCADE;foreignKey:OwnerID;references:ID"`
	Photos []Photo `gorm:"many2many:album_photos"`
}

type AlbumPhoto struct {
	AlbumID string    `gorm:"primaryKey;type:text;index"`
	PhotoID string    `gorm:"primaryKey;type:text;index"`
	Pos     int       `gorm:"default:0;index"`
	AddedAt time.Time `gorm:"not null;index"`

	Album Album `gorm:"constraint:OnDelete:CASCADE,OnUpdate:CASCADE;foreignKey:AlbumID;references:ID"`
	Photo Photo `gorm:"constraint:OnDelete:CASCADE,OnUpdate:CASCADE;foreignKey:PhotoID;references:ID"`
}

func (AlbumPhoto) TableName() string { return "album_photos" }
