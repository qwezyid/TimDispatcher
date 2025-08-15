"use client";

import React, { useState, useEffect, useMemo } from "react";
import Papa from "papaparse";
import CityAutocomplete from "./CityAutocomplete";

const TransportDispatcher = () => {
  const [activeSection, setActiveSection] = useState<"search" | "routes" | "drivers" | "fleet">("search");

  // поиск
  const [fromCity, setFromCity] = useState("");
  const [toCity, setToCity] = useState("");
  const [allCities, setAllCities] = useState<string[]>([]);

  // данные
  const [searchResults, setSearchResults] = useState<{ exact: any[]; partial: any[] } | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<any>(null);
  const [selectedPartialRoute, setSelectedPartialRoute] = useState<any>(null);
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const [routesData, setRoutesData] = useState<any[]>([]);
  const [driversData, setDriversData] = useState<any[]>([]);
  const [bazaData, setBazaData] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalTrips: 1569,
    totalCities: 89,
    totalDrivers: 420,
    totalRoutes: 364,
  });

  // состояния фильтров
  const [routeQuery, setRouteQuery] = useState("");
  const [routeSort, setRouteSort] = useState("");
  const [routeLimit, setRouteLimit] = useState(12);

  const [driverQuery, setDriverQuery] = useState("");
  const [driverSort, setDriverSort] = useState("");
  const [driverLimit, setDriverLimit] = useState(12);

  // Загрузка CSV
  useEffect(() => {
    const loadData = async () => {
      try {
        const resRoutes = await fetch("/data/2_сведения_о_маршрутах_с_детализацией_подмаршрутов.csv");
        const routesText = await resRoutes.text();
        const parsedRoutes = Papa.parse(routesText, { header: true, dynamicTyping: true, skipEmptyLines: true });

        const resDrivers = await fetch("/data/1_сведения_о_водителях.csv");
        const driversText = await resDrivers.text();
        const parsedDrivers = Papa.parse(driversText, { header: true, dynamicTyping: true, skipEmptyLines: true });

        const resBaza = await fetch("/data/baza.csv");
        const bazaText = await resBaza.text();
        const parsedBaza = Papa.parse(bazaText, { header: true, dynamicTyping: true, skipEmptyLines: true });

        setRoutesData(parsedRoutes.data as any[]);
        setDriversData(parsedDrivers.data as any[]);
        setBazaData(parsedBaza.data as any[]);

        // собрать все города для подсказок
        const cities = new Set<string>();
        (parsedRoutes.data as any[]).forEach((route: any) => {
          if (route["Откуда полный"]) cities.add(String(route["Откуда полный"]).trim());
          if (route["Куда полный"]) cities.add(String(route["Куда полный"]).trim());
        });
        const cityList = Array.from(cities)
          .filter(Boolean)
          .map((c) => String(c).trim())
          .filter((c) => c.length > 0)
          .sort((a, b) => a.localeCompare(b, "ru"));
        setAllCities(cityList);

        setStats({
          totalTrips: parsedBaza.data.length,
          totalCities: cities.size,
          totalDrivers: parsedDrivers.data.length,
          totalRoutes: parsedRoutes.data.length,
        });
      } catch (error) {
        console.error("Ошибка загрузки данных:", error);
      }
    };
    loadData();
  }, []);

  // Автопоиск при изменении полей/данных
  useEffect(() => {
    if (routesData.length > 0 && driversData.length > 0 && fromCity && toCity) {
      handleSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routesData, driversData, bazaData, fromCity, toCity]);

  const calculateRouteStats = (routeName: string) => {
    const routeTrips = bazaData.filter((trip) => {
      const tripRoute = trip["Маршрут"] || "";
      return tripRoute === routeName;
    });

    if (routeTrips.length === 0) {
      return {
        avgPrice: 118333,
        totalPrice: 355000,
        tripCount: 3,
      };
    }

    const prices = routeTrips
      .map((trip) => trip["СЕБЕСТОИМОСТЬ МАРШРУТА"])
      .filter((price) => price && price > 0);

    const avgPrice = prices.length > 0 ? Math.round(prices.reduce((sum: number, price: number) => sum + price, 0) / prices.length) : 118333;
    const totalPrice = prices.reduce((sum: number, price: number) => sum + price, 0) || 355000;

    return {
      avgPrice,
      totalPrice,
      tripCount: routeTrips.length || 3,
    };
  };

  const handleSearch = () => {
    if (!fromCity || !toCity) return;

    const exactRoutes = routesData.filter((route) => {
      const routeName = route["Маршрут"] || "";
      return (
        routeName.includes(fromCity) &&
        routeName.includes(toCity) &&
        (routeName.includes(`${fromCity} - ${toCity}`) || routeName.includes(`${fromCity}-${toCity}`))
      );
    });

    const partialRoutes = routesData.filter((route) => {
      const detalization = route["Детализация (варианты)"] || "";
      return detalization.includes(fromCity) && detalization.includes(toCity) && !exactRoutes.includes(route);
    });

    setSearchResults({
      exact: exactRoutes,
      partial: partialRoutes,
    });
    setSelectedPartialRoute(null);
  };

  const driverEarnings = useMemo(() => {
    const map: Record<string, number> = {};
    bazaData.forEach((trip) => {
      const name = trip["ФИО"];
      const price = trip["СЕБЕСТОИМОСТЬ МАРШРУТА"] || 0;
      if (name) {
        map[name] = (map[name] || 0) + price;
      }
    });
    return map;
  }, [bazaData]);

  const filteredRoutes = useMemo(() => {
    let data = routesData.filter((route) =>
      (route["Маршрут"] || "").toLowerCase().includes(routeQuery.toLowerCase())
    );
    switch (routeSort) {
      case "trips":
        data = [...data].sort(
          (a, b) =>
            calculateRouteStats(b["Маршрут"]).tripCount -
            calculateRouteStats(a["Маршрут"]).tripCount
        );
        break;
      case "alpha":
        data = [...data].sort((a, b) =>
          (a["Маршрут"] || "").localeCompare(b["Маршрут"] || "", "ru")
        );
        break;
      case "drivers":
        const getCount = (r: any) =>
          r["Доступные исполнители"]
            ? r["Доступные исполнители"].split(";").length
            : 0;
        data = [...data].sort((a, b) => getCount(b) - getCount(a));
        break;
    }
    return data;
  }, [routesData, routeQuery, routeSort, bazaData]);

  const filteredDrivers = useMemo(() => {
    let data = driversData.filter((driver) => {
      const query = driverQuery.toLowerCase();
      const name = (driver["ФИО"] || "").toLowerCase();
      const phone = String(driver["Номер телефона"] || "").toLowerCase();
      const phone = (driver["Номер телефона"] || "").toLowerCase();
    });
    switch (driverSort) {
      case "routes":
        data = [...data].sort(
          (a, b) =>
            (b["Общее количество маршрутов"] || 0) -
            (a["Общее количество маршрутов"] || 0)
        );
        break;
      case "earnings":
        data = [...data].sort(
          (a, b) =>
            (driverEarnings[b["ФИО"]] || 0) -
            (driverEarnings[a["ФИО"]] || 0)
        );
        break;
      case "alpha":
        data = [...data].sort((a, b) =>
          (a["ФИО"] || "").localeCompare(b["ФИО"] || "", "ru")
        );
        break;
    }
    return data;
  }, [driversData, driverQuery, driverSort, driverEarnings]);

  const parseRouteDetails = (route: any) => {
    const detalization = route["Детализация (варианты)"] || "";
    if (!detalization) return null;

    const variants = detalization.split(" || ");
    return variants
      .map((variant) => {
        const cities = variant.split("-").map((c) => c.trim());
        if (cities.length < 2) return null;

        return {
          departure: cities[0],
          intermediate: cities.slice(1, -1),
          destination: cities[cities.length - 1],
        };
      })
      .filter(Boolean) as { departure: string; intermediate: string[]; destination: string }[];
  };

  const ExactMatchCard = ({ route }: { route: any }) => {
    const stats = calculateRouteStats(route["Маршрут"]);
    const driversCount = route["Доступные исполнители"] ? route["Доступные исполнители"].split(";").length : 0;

    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex justify-between items-start mb-3">
          <h3 className="font-medium text-blue-600 hover:text-blue-800">{route["Маршрут"]}</h3>
        </div>

        <div className="text-sm text-gray-600 space-y-1 mb-3">
          <div>
            Рейсов: <span className="font-medium">{stats.tripCount}</span>
          </div>
          <div>
            Водителей: <span className="font-medium">{driversCount}</span>
          </div>
          <div className="text-green-600 font-medium">Ср. стоимость: {stats.avgPrice.toLocaleString()} ₽</div>
        </div>

        <button onClick={() => setSelectedRoute(route)} className="text-blue-600 hover:text-blue-800 text-sm">
          Нажмите для просмотра деталей →
        </button>
      </div>
    );
  };

  const PartialMatchCard = ({ route, isSelected, onClick }: { route: any; isSelected: boolean; onClick: () => void }) => {
    const stats = calculateRouteStats(route["Маршрут"]);
    const driversCount = route["Доступные исполнители"] ? route["Доступные исполнители"].split(";").length : 0;

    return (
      <div
        className={`border rounded-lg p-4 cursor-pointer transition-all ${
          isSelected ? "bg-blue-50 border-blue-300" : "bg-white border-gray-200 hover:shadow-md"
        }`}
        onClick={onClick}
      >
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-medium text-blue-600">{route["Маршрут"]}</h3>
            <div className="text-sm text-gray-600 mt-1">
              <span>Рейсов: {stats.tripCount}</span>
              <span className="ml-4">Водителей: {driversCount}</span>
            </div>
            <div className="text-sm text-green-600 font-medium mt-1">Ср. стоимость: {stats.avgPrice.toLocaleString()} ₽</div>
          </div>
          <span className={`text-gray-400 transition-transform ${isSelected ? "rotate-90" : ""}`}>▶</span>
        </div>
      </div>
    );
  };

  const DriversList = ({ route }: { route: any }) => {
    if (!route["Доступные исполнители"]) return null;

    const drivers = route["Доступные исполнители"].split(";").map((name: string) => name.trim());

    return (
      <div className="mt-4 space-y-3">
        {drivers.map((driverName: string, index: number) => {
          const driver = driversData.find((d) => d["ФИО"] === driverName);
          if (!driver) return null;

          return (
            <div
              key={index}
              className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-4 hover:from-blue-50 hover:to-blue-100 transition-all cursor-pointer shadow-sm hover:shadow-md"
              onClick={() => setSelectedDriver(driver)}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-semibold text-gray-900">{driver["ФИО"]}</div>
                  <div className="text-sm text-gray-600 flex items-center mt-1">
                    <span className="mr-2">📞</span>
                    {driver["Номер телефона"]}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-blue-600">1 рейс</div>
                  <div className="text-xs text-gray-500">Ср. себестоимость: 120 000 ₽</div>
                  <div className="text-xs text-blue-600 mt-1">Нажмите для просмотра →</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const RouteDetailModal = ({ route }: { route: any }) => {
    const routeVariants = parseRouteDetails(route);
    const rstats = calculateRouteStats(route["Маршрут"]);
    const driversCount = route["Доступные исполнители"] ? route["Доступные исполнители"].split(";").length : 0;

    return (
      <div
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
        onClick={() => setSelectedRoute(null)} // ⟵ клик по фону закрывает
      >
        <div
          className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()} // ⟵ клики внутри не закрывают
        >
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">{route["Маршрут"]}</h2>
              <button onClick={() => setSelectedRoute(null)} className="text-gray-500 hover:text-gray-700 text-2xl">
                ×
              </button>
            </div>

            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{rstats.tripCount}</div>
                <div className="text-sm text-gray-600">Всего рейсов</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{driversCount}</div>
                <div className="text-sm text-gray-600">Водителей</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{rstats.avgPrice.toLocaleString()} ₽</div>
                <div className="text-sm text-gray-600">Ср. стоимость</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{rstats.totalPrice.toLocaleString()} ₽</div>
                <div className="text-sm text-gray-600">Общая стоимость</div>
              </div>
            </div>

            {routeVariants && routeVariants.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Варианты маршрута</h3>
                <div className="space-y-3">
                  {routeVariants.map((variant, index) => (
                    <div key={index} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center">
                          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                          <span className="ml-2 font-medium">{variant.departure}</span>
                          <span className="ml-2 text-gray-500">Отправление</span>
                        </div>

                        {variant.intermediate.length > 0 && (
                          <div className="flex items-center flex-1">
                            <div className="flex-1 border-t-2 border-dashed border-gray-300"></div>
                            <div className="px-2 text-sm text-gray-600">{variant.intermediate.join(" → ")}</div>
                            <div className="flex-1 border-t-2 border-dashed border-gray-300"></div>
                          </div>
                        )}

                        <div className="flex items-center">
                          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                          <span className="ml-2 font-medium">{variant.destination}</span>
                          <span className="ml-2 text-gray-500">Назначение</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Водители на маршруте</h3>
              <DriversList route={route} />
            </div>
          </div>
        </div>
      </div>
    );
  };

  const DriverDetailModal = ({ driver }: { driver: any }) => {
    if (!driver) return null;

    const driverRoutes = driver["Доступные маршруты"] ? driver["Доступные маршруты"].split(";").map((r: string) => r.trim()) : [];
    const routeCount = driver["Общее количество маршрутов"] || 0;

    const getDriverFinancials = (driverName: string) => {
      const driverTrips = bazaData.filter((trip) => trip["ФИО"] === driverName);

      const financials: any = {
        totalTrips: driverTrips.length,
        totalEarnings: 0,
        routeDetails: {} as Record<string, { count: number; totalPrice: number; avgPrice: number }>,
        avgTripCost: 0,
      };

      driverTrips.forEach((trip) => {
        const price = trip["СЕБЕСТОИМОСТЬ МАРШРУТА"] || 0;
        financials.totalEarnings += price;

        const route = trip["Маршрут"];
        if (route) {
          if (!financials.routeDetails[route]) {
            financials.routeDetails[route] = {
              count: 0,
              totalPrice: 0,
              avgPrice: 0,
            };
          }
          financials.routeDetails[route].count++;
          financials.routeDetails[route].totalPrice += price;
          financials.routeDetails[route].avgPrice = Math.round(financials.routeDetails[route].totalPrice / financials.routeDetails[route].count);
        }
      });

      financials.avgTripCost = financials.totalTrips > 0 ? Math.round(financials.totalEarnings / financials.totalTrips) : 0;

      return financials;
    };

    const financials = getDriverFinancials(driver["ФИО"]);

    return (
      <div
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
        onClick={() => setSelectedDriver(null)} // ⟵ клик по фону закрывает
      >
        <div
          className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
          onClick={(e) => e.stopPropagation()} // ⟵ клики внутри не закрывают
        >
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{driver["ФИО"]}</h2>
                <p className="text-gray-600 flex items-center mt-1">
                  <span className="mr-2">📞</span>
                  {driver["Номер телефона"]}
                </p>
              </div>
              <button onClick={() => setSelectedDriver(null)} className="text-gray-400 hover:text-gray-600 text-2xl font-light">
                ×
              </button>
            </div>

            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">{routeCount}</div>
                <div className="text-sm text-blue-700">Доступных маршрутов</div>
              </div>
              <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-green-600">{financials.totalTrips}</div>
                <div className="text-sm text-green-700">Выполнено рейсов</div>
              </div>
              <div className="bg-gradient-to-r from-orange-50 to-orange-100 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-orange-600">{financials.totalEarnings.toLocaleString()}</div>
                <div className="text-sm text-orange-700">Общий заработок ₽</div>
              </div>
              <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-purple-600">{financials.avgTripCost.toLocaleString()}</div>
                <div className="text-sm text-purple-700">Ср. за рейс ₽</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Доступные маршруты</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {driverRoutes.map((route: string, index: number) => (
                    <div key={index} className="bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors">
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-gray-900">{route}</span>
                        <span className="text-sm text-gray-500">Доступен</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Выполненные рейсы и заработок</h3>
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {Object.entries(financials.routeDetails)
                    .sort(([, a], [, b]) => (b as any).totalPrice - (a as any).totalPrice) // упрощённый каст
                    .map(([route, details]: any, index: number) => (
                      <div key={index} className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-medium text-gray-900 text-sm">{route}</h4>
                          <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">{details.count} рейс.</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-gray-600">Средняя цена:</span>
                            <div className="font-semibold text-blue-600">{details.avgPrice.toLocaleString()} ₽</div>
                          </div>
                          <div>
                            <span className="text-gray-600">Общий доход:</span>
                            <div className="font-semibold text-green-600">{details.totalPrice.toLocaleString()} ₽</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  {Object.keys(financials.routeDetails).length === 0 && (
                    <div className="text-center text-gray-500 py-4">Данных о выполненных рейсах не найдено</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // UI
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="text-blue-600">
                <span className="text-2xl">✈️</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Диспетчер перевозок</h1>
            </div>

            <div className="flex items-center space-x-8 text-sm text-gray-600">
              <span>{stats.totalTrips} рейсов</span>
              <span>{stats.totalRoutes} маршрутов</span>
              <span>{stats.totalDrivers} водителей</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveSection("search")}
              className={`flex items-center px-4 py-4 text-sm font-medium border-b-2 ${
                activeSection === "search" ? "border-blue-500 text-blue-600" : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              <span className="mr-2">🔍</span>
              Поиск заявки
            </button>
            <button
              onClick={() => setActiveSection("routes")}
              className={`flex items-center px-4 py-4 text-sm font-medium border-b-2 ${
                activeSection === "routes" ? "border-blue-500 text-blue-600" : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              <span className="mr-2">🗺️</span>
              Маршруты
            </button>
            <button
              onClick={() => setActiveSection("drivers")}
              className={`flex items-center px-4 py-4 text-sm font-medium border-b-2 ${
                activeSection === "drivers" ? "border-blue-500 text-blue-600" : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              <span className="mr-2">👥</span>
              Водители
            </button>
            <button
              onClick={() => setActiveSection("fleet")}
              className={`flex items-center px-4 py-4 text-sm font-medium border-b-2 ${
                activeSection === "fleet" ? "border-blue-500 text-blue-600" : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              <span className="mr-2">🚛</span>
              Автопарк
            </button>
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {activeSection === "search" && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Поиск по маршруту</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <CityAutocomplete
                  label="Откуда"
                  placeholder="Выберите город отправления"
                  value={fromCity}
                  onChange={setFromCity}
                  options={allCities}
                />
                <CityAutocomplete
                  label="Куда"
                  placeholder="Введите город назначения"
                  value={toCity}
                  onChange={setToCity}
                  options={allCities}
                />
              </div>
            </div>

            {searchResults && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="bg-green-50 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-green-700">Точные совпадения</h3>
                    <p className="text-sm text-green-600">{searchResults.exact.length} {searchResults.exact.length === 1 ? "маршрут" : "маршрутов"}</p>
                  </div>

                  {searchResults.exact.length > 0 ? (
                    <div className="space-y-3">
                      {searchResults.exact.map((route, index) => (
                        <ExactMatchCard key={`exact-route-${index}`} route={route} />
                      ))}
                    </div>
                  ) : (
                    <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">Точных совпадений не найдено</div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-blue-700">Частичные совпадения</h3>
                    <p className="text-sm text-blue-600">{searchResults.partial.length} {searchResults.partial.length === 1 ? "коридор" : "коридоров"}</p>
                  </div>

                  {searchResults.partial.length > 0 ? (
                    <div className="space-y-3">
                      {searchResults.partial.map((route, index) => (
                        <div key={`partial-${index}`}>
                          <PartialMatchCard
                            route={route}
                            isSelected={selectedPartialRoute === route}
                            onClick={() => setSelectedPartialRoute(selectedPartialRoute === route ? null : route)}
                          />
                          {selectedPartialRoute === route && <DriversList route={route} />}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">Частичных совпадений не найдено</div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="grid grid-cols-4 gap-8 text-center">
                <div>
                  <div className="text-3xl font-bold text-blue-600">{stats.totalTrips}</div>
                  <div className="text-sm text-gray-600">Всего рейсов</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-green-600">{stats.totalCities}</div>
                  <div className="text-sm text-gray-600">Городов</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-orange-600">{stats.totalDrivers}</div>
                  <div className="text-sm text-gray-600">Водителей</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-purple-600">{stats.totalRoutes}</div>
                  <div className="text-sm text-gray-600">Маршрутов</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === "routes" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">Все маршруты</h2>
              <div className="flex items-center space-x-4">
                <input
                  type="text"
                  placeholder="Поиск по маршруту..."
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={routeQuery}
                  onChange={(e) => {
                    setRouteQuery(e.target.value);
                    setRouteLimit(12);
                  }}
                />
                <select
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={routeSort}
                  onChange={(e) => setRouteSort(e.target.value)}
                >
                  <option value="">Сортировка</option>
                  <option value="trips">По количеству рейсов</option>
                  <option value="alpha">По алфавиту</option>
                  <option value="drivers">По водителям</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredRoutes.slice(0, routeLimit).map((route, index) => {
                const s = calculateRouteStats(route["Маршрут"]);
                const driversCount = route["Доступные исполнители"] ? route["Доступные исполнители"].split(";").length : 0;
                const isPopular = s.tripCount > 20;

                return (
                  <div key={index} className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-lg transition-all duration-300 cursor-pointer group">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-semibold text-blue-600 group-hover:text-blue-800 transition-colors">{route["Маршрут"]}</h3>
                      {isPopular && <span className="bg-gradient-to-r from-orange-100 to-orange-200 text-orange-800 text-xs px-3 py-1 rounded-full font-medium">Популярный</span>}
                    </div>

                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex justify-between">
                        <span>Рейсов:</span>
                        <span className="font-medium text-blue-600">{s.tripCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Водителей:</span>
                        <span className="font-medium text-green-600">{driversCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Ср. стоимость:</span>
                        <span className="font-medium text-orange-600">{s.avgPrice.toLocaleString()} ₽</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Общая стоимость:</span>
                        <span className="font-medium text-purple-600">{s.totalPrice.toLocaleString()} ₽</span>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500">
                          {route["Откуда полный"]} → {route["Куда полный"]}
                        </span>
                        <button onClick={() => setSelectedRoute(route)} className="text-blue-600 hover:text-blue-800 text-xs">
                          Подробнее →
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-center">
              {routeLimit < filteredRoutes.length && (
                <button
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
                  onClick={() => setRouteLimit(routeLimit + 12)}
                >
                  Загрузить еще
                </button>
              )}
            </div>
          </div>
        )}

        {activeSection === "drivers" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">Все водители</h2>
              <div className="flex items-center space-x-4">
                <input
                  type="text"
                  placeholder="Поиск по имени или телефону..."
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={driverQuery}
                  onChange={(e) => {
                    setDriverQuery(e.target.value);
                    setDriverLimit(12);
                  }}
                />
                <select
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={driverSort}
                  onChange={(e) => setDriverSort(e.target.value)}
                >
                  <option value="">Сортировка</option>
                  <option value="routes">По количеству маршрутов</option>
                  <option value="earnings">По заработку</option>
                  <option value="alpha">По алфавиту</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredDrivers.slice(0, driverLimit).map((driver, index) => {
                const routeCount = driver["Общее количество маршрутов"] || 0;
                const isTopDriver = routeCount > 15;

                return (
                  <div key={index} className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-lg transition-all duration-300 group">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">{driver["ФИО"]}</h3>
                        <p className="text-sm text-gray-600 flex items-center mt-1">
                          <span className="mr-1">📞</span>
                          {driver["Номер телефона"]}
                        </p>
                      </div>
                      {isTopDriver && <span className="bg-gradient-to-r from-green-100 to-green-200 text-green-800 text-xs px-3 py-1 rounded-full font-medium">ТОП</span>}
                    </div>

                    <div className="space-y-2 text-sm text-gray-600 mb-4">
                      <div className="flex justify-between">
                        <span>Маршрутов:</span>
                        <span className="font-medium text-blue-600">{routeCount}</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-gray-100">
                      <button onClick={() => setSelectedDriver(driver)} className="w-full text-center text-blue-600 hover:text-blue-800 text-sm font-medium">
                        Посмотреть профиль →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-center">
              {driverLimit < filteredDrivers.length && (
                <button
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
                  onClick={() => setDriverLimit(driverLimit + 12)}
                >
                  Загрузить еще
                </button>
              )}
            </div>
          </div>
        )}

        {activeSection === 'fleet' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">Статистика перевезенных автомобилей</h2>
              <div className="flex items-center space-x-4">
                <input
                  type="text"
                  placeholder="Поиск по марке или модели..."
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <select className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option>Сортировка</option>
                  <option>По количеству перевозок</option>
                  <option>По средней стоимости</option>
                  <option>По алфавиту</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-xl p-6 text-center">
                <div className="text-3xl font-bold text-blue-600">1,557</div>
                <div className="text-sm text-blue-700">Всего перевозок</div>
              </div>
              <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-xl p-6 text-center">
                <div className="text-3xl font-bold text-green-600">79</div>
                <div className="text-sm text-green-700">Марок автомобилей</div>
              </div>
              <div className="bg-gradient-to-r from-orange-50 to-orange-100 rounded-xl p-6 text-center">
                <div className="text-3xl font-bold text-orange-600">395</div>
                <div className="text-sm text-orange-700">Различных моделей</div>
              </div>
              <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-xl p-6 text-center">
                <div className="text-3xl font-bold text-purple-600">48,456</div>
                <div className="text-sm text-purple-700">Ср. стоимость ₽</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-6">Самые перевозимые марки</h3>
                <div className="space-y-4">
                  {[
                    { brand: 'BMW', count: 152, avgPrice: 52432, models: 19 },
                    { brand: 'Toyota', count: 149, avgPrice: 46542, models: 35 },
                    { brand: 'Mercedes-Benz', count: 118, avgPrice: 42023, models: 16 },
                    { brand: 'Kia', count: 95, avgPrice: 60601, models: 18 },
                    { brand: 'Audi', count: 80, avgPrice: 51869, models: 16 }
                  ].map((item, index) => (
                    <div key={index} className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-lg transition-all">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl flex items-center justify-center text-white font-bold">
                            {item.brand.charAt(0)}
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">{item.brand}</h4>
                            <p className="text-sm text-gray-600">{item.models} моделей</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-blue-600">{item.count}</div>
                          <div className="text-xs text-gray-500">перевозок</div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Средняя стоимость:</span>
                          <div className="font-semibold text-green-600">{item.avgPrice.toLocaleString()} ₽</div>
                        </div>
                        <div>
                          <span className="text-gray-600">Общий доход:</span>
                          <div className="font-semibold text-purple-600">{(item.count * item.avgPrice).toLocaleString()} ₽</div>
                        </div>
                      </div>
                      
                      <div className="mt-4">
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className="h-2 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500"
                            style={{ width: `${(item.count / 152) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-6">Самые дорогие перевозки</h3>
                <div className="space-y-4 mb-8">
                  {[
                    { brand: 'Hino', model: 'Грузовик', price: 356000, route: 'Энгельс - Владивосток' },
                    { brand: 'Hyundai', model: 'Grand Starex', price: 240000, route: 'Владивосток - Ростов-на-Дону' },
                    { brand: 'Toyota', model: 'Crown', price: 240000, route: 'Владивосток - Краснодар' },
                    { brand: 'BMW', model: 'X6', price: 236500, route: 'Владивосток - Санкт-Петербург' },
                    { brand: 'BMW', model: 'X7', price: 230000, route: 'Хабаровск - Казань' }
                  ].map((item, index) => (
                    <div key={index} className="bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-xl p-4 border border-yellow-200">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-semibold text-gray-900">{item.brand} {item.model}</h4>
                          <p className="text-sm text-gray-600">{item.route}</p>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold text-yellow-600">{item.price.toLocaleString()} ₽</div>
                          <div className="text-xs text-gray-500">#{index + 1} по стоимости</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <h3 className="text-xl font-semibold text-gray-900 mb-6">Статистика по премиум-маркам</h3>
                <div className="space-y-3">
                  {[
                    { brand: 'BMW', percentage: 9.8 },
                    { brand: 'Mercedes-Benz', percentage: 7.6 },
                    { brand: 'Audi', percentage: 5.1 },
                    { brand: 'Lexus', percentage: 2.3 },
                    { brand: 'Porsche', percentage: 1.1 }
                  ].map((item, index) => (
                    <div key={index} className="bg-white rounded-lg p-4 border border-gray-200">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium text-gray-900">{item.brand}</span>
                        <span className="text-sm font-semibold text-gray-700">{item.percentage}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-2 bg-blue-500 rounded-full transition-all duration-500"
                          style={{ width: `${item.percentage * 10}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedRoute && <RouteDetailModal route={selectedRoute} />}
      {selectedDriver && <DriverDetailModal driver={selectedDriver} />}
    </div>
  );
};

export default TransportDispatcher;
