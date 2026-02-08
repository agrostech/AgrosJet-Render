"""
Test Adisyo Note Parsing - P0-1 Features
- Ödeme bilgileri (Online Kredi/Banka Kartı) notlardan temizleniyor mu?
- Not kategorileri - CUSTOMER ve KITCHEN ayrımı doğru yapılıyor mu?
"""
import pytest
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.adisyo_service import parse_and_categorize_notes


class TestParseAndCategorizeNotes:
    """Test parse_and_categorize_notes function"""
    
    def test_payment_info_removed_online_kredi_banka_karti(self):
        """P0-1: Online Kredi/Banka Kartı ödeme bilgisi temizlenmeli"""
        raw_notes = "Online Kredi/Banka Kartı | ömer aybak çiğköfteye gelicek | çatal bıçak göndermeyin"
        result = parse_and_categorize_notes(raw_notes)
        
        # Ödeme bilgisi olmamalı
        assert "Online Kredi" not in result
        assert "Banka Kartı" not in result
        assert "Kredi/Banka" not in result
        
        # Müşteri ve mutfak notları olmalı
        assert "CUSTOMER:" in result
        assert "KITCHEN:" in result
        print(f"✓ Payment info removed. Result: {result}")
    
    def test_customer_note_categorization(self):
        """P0-1: Müşteri notları CUSTOMER: öneki ile işaretlenmeli"""
        raw_notes = "Online Kredi/Banka Kartı | ömer aybak çiğköfteye gelicek"
        result = parse_and_categorize_notes(raw_notes)
        
        assert "CUSTOMER:" in result
        assert "ömer aybak çiğköfteye gelicek" in result
        print(f"✓ Customer note categorized correctly. Result: {result}")
    
    def test_kitchen_note_categorization(self):
        """P0-1: Mutfak notları KITCHEN: öneki ile işaretlenmeli"""
        raw_notes = "çatal bıçak göndermeyin"
        result = parse_and_categorize_notes(raw_notes)
        
        assert "KITCHEN:" in result
        assert "çatal bıçak göndermeyin" in result
        print(f"✓ Kitchen note categorized correctly. Result: {result}")
    
    def test_full_example_from_spec(self):
        """P0-1: Tam örnek - spec'teki örnek doğru çalışmalı"""
        raw_notes = "Online Kredi/Banka Kartı | ömer aybak çiğköfteye gelicek | çatal bıçak göndermeyin"
        result = parse_and_categorize_notes(raw_notes)
        
        # Expected: "CUSTOMER:ömer aybak çiğköfteye gelicek|KITCHEN:çatal bıçak göndermeyin"
        assert "CUSTOMER:" in result
        assert "KITCHEN:" in result
        assert "ömer aybak çiğköfteye gelicek" in result
        assert "çatal bıçak göndermeyin" in result
        assert "Online" not in result
        assert "Kredi" not in result
        print(f"✓ Full example works. Result: {result}")
    
    def test_nakit_odeme_removed(self):
        """Nakit Ödeme bilgisi temizlenmeli"""
        raw_notes = "Nakit Ödeme | müşteri kapıda bekliyor"
        result = parse_and_categorize_notes(raw_notes)
        
        assert "Nakit" not in result
        assert "Ödeme" not in result
        assert "müşteri kapıda bekliyor" in result
        print(f"✓ Nakit Ödeme removed. Result: {result}")
    
    def test_kapida_odeme_removed(self):
        """Kapıda Ödeme bilgisi temizlenmeli"""
        raw_notes = "Kapıda Ödeme | 3. kat"
        result = parse_and_categorize_notes(raw_notes)
        
        assert "Kapıda" not in result
        assert "3. kat" in result
        print(f"✓ Kapıda Ödeme removed. Result: {result}")
    
    def test_multiple_kitchen_notes(self):
        """Birden fazla mutfak notu doğru işlenmeli"""
        raw_notes = "çatal bıçak göndermeyin | acı istemiyorum | ekstra sos"
        result = parse_and_categorize_notes(raw_notes)
        
        assert "KITCHEN:" in result
        # All kitchen notes should be present
        assert "çatal bıçak" in result
        assert "acı" in result
        assert "sos" in result
        print(f"✓ Multiple kitchen notes handled. Result: {result}")
    
    def test_empty_notes(self):
        """Boş not boş string döndürmeli"""
        result = parse_and_categorize_notes("")
        assert result == ""
        
        result = parse_and_categorize_notes(None)
        assert result == ""
        print("✓ Empty notes handled correctly")
    
    def test_only_payment_info(self):
        """Sadece ödeme bilgisi varsa boş döndürmeli"""
        raw_notes = "Online Kredi/Banka Kartı"
        result = parse_and_categorize_notes(raw_notes)
        
        assert result == ""
        print("✓ Only payment info returns empty")
    
    def test_pos_removed(self):
        """POS bilgisi temizlenmeli"""
        raw_notes = "POS | müşteri arayacak"
        result = parse_and_categorize_notes(raw_notes)
        
        assert "POS" not in result
        assert "müşteri arayacak" in result
        print(f"✓ POS removed. Result: {result}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
