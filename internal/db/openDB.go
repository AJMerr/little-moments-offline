package db

import (
	"fmt"
	"log"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// DSN Builder with pragmas
func SQLiteDSN(path string) string {
	//WAL, FK, and Busy Timeout
	return fmt.Sprintf(
		"file:%s?_pragma=journal_mode(WAL)&_pragma=foreign_keys(ON)&_pragma=busy_timeout(5000)",
		path,
	)
}

// Opens the DB
func OpenDB(path string) (*gorm.DB, error) {
	dsn := SQLiteDSN(path)

	gdb, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})

	if err != nil {
		return nil, err
	}

	sqlDB, err := gdb.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	sqlDB.SetConnMaxLifetime(0)

	// Verifying DB connection works
	if err := sqlDB.Ping(); err != nil {
		return nil, err
	}

	log.Printf("sqlite open: %s", path)
	return gdb, nil
}
