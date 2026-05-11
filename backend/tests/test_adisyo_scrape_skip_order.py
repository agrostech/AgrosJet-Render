"""
Regression: Masa / POS / adressiz Adisyo siparişleri AgrosJet'e aktarılmamalı.
Bug history (11 May 2026): _should_skip_order eklemeden önce Adisyo POS'ta
girilen masa siparişleri ve adressiz POS siparişleri yanlışlıkla scrape
endpoint'inden AgrosJet'e düşüyordu.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.mark.asyncio
async def test_should_skip_order_table_pos_address_missing(monkeypatch):
    monkeypatch.setenv("DB_NAME", "agrosjet_test_skip_order")
    for mod in list(sys.modules):
        if mod.startswith("routers") or mod.startswith("utils") or mod.startswith("services"):
            sys.modules.pop(mod, None)

    from routers.adisyo_scrape import _should_skip_order

    # 1) Masa siparişi (tableId dolu) → skip
    assert _should_skip_order({
        "tableId": 5, "orderType": 1, "deliveryType": 1,
        "restaurantCustomer": {"address": "x"},
    }) == "masa_siparisi (tableId=5)"

    # 2) Restoran içi (deliveryType=1) → skip
    assert _should_skip_order({
        "tableId": None, "orderType": 3, "deliveryType": 1,
        "restaurantCustomer": {"address": "x"},
    }).startswith("teslimat_disi")

    # 3) Masa orderType (orderType=1) → skip
    assert _should_skip_order({
        "tableId": None, "orderType": 1, "deliveryType": 2,
        "restaurantCustomer": {"address": "x"},
    }).startswith("paket_disi")

    # 4) Adres yok → skip
    assert _should_skip_order({
        "tableId": None, "orderType": 3, "deliveryType": 2,
        "restaurantCustomer": {"name": "Müşteri", "address": ""},
    }) == "adres_yok"

    # 5) Adres tamamen None → skip
    assert _should_skip_order({
        "tableId": None, "orderType": 3, "deliveryType": 2,
        "restaurantCustomer": None,
    }) == "adres_yok"

    # 6) Telefon paket sipariş (externalAppId null AMA adres dolu) → kabul
    assert _should_skip_order({
        "tableId": None, "orderType": 3, "deliveryType": 2,
        "externalAppId": None,
        "restaurantCustomer": {"address": "Gerçek Sok 5"},
    }) is None

    # 7) Platform paket (Trendyol/YS/Getir) → kabul
    assert _should_skip_order({
        "tableId": None, "orderType": 3, "deliveryType": 2,
        "externalAppId": 21,
        "restaurantCustomer": {"address": "Platform Adres"},
    }) is None

    # 8) Field'lar yoksa (defensive): orderType/deliveryType belirtilmemiş, adres var → kabul
    # Bu durumda Adisyo eski API uyumluluğu için kabul edilir
    assert _should_skip_order({
        "restaurantCustomer": {"address": "Bir Adres"},
    }) is None
